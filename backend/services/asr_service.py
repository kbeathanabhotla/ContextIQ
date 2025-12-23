import torch
import torchaudio
from transformers import (
    AutoConfig,
    AutoModelForCausalLM,
    AutoTokenizer,
    WhisperFeatureExtractor,
)
import numpy as np
import logging
from typing import Optional

logger = logging.getLogger(__name__)

WHISPER_FEAT_CFG = {
    "chunk_length": 30,
    "feature_extractor_type": "WhisperFeatureExtractor",
    "feature_size": 128,
    "hop_length": 160,
    "n_fft": 400,
    "n_samples": 480000,
    "nb_max_frames": 3000,
    "padding_side": "right",
    "padding_value": 0.0,
    "processor_class": "WhisperProcessor",
    "return_attention_mask": False,
    "sampling_rate": 16000,
}


def get_audio_token_length(seconds, merge_factor=2):
    """Calculate audio token length based on audio duration"""
    def get_T_after_cnn(L_in, dilation=1):
        for padding, kernel_size, stride in eval("[(1,3,1)] + [(1,3,2)] "):
            L_out = L_in + 2 * padding - dilation * (kernel_size - 1) - 1
            L_out = 1 + L_out // stride
            L_in = L_out
        return L_out

    mel_len = int(seconds * 100)
    audio_len_after_cnn = get_T_after_cnn(mel_len)
    audio_token_num = (audio_len_after_cnn - merge_factor) // merge_factor + 1

    # Current whisper model can't process longer sequence
    audio_token_num = min(audio_token_num, 1500 // merge_factor)

    return audio_token_num


class ASRService:
    """GLM-ASR service for speech recognition"""
    
    def __init__(self, model_name: str = "zai-org/GLM-ASR-Nano-2512"):
        self.model_name = model_name
        self.tokenizer = None
        self.feature_extractor = None
        self.model = None
        self.config = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.is_loaded = False
        self.merge_factor = 2  # Default, will be updated from config
        
    def load_model(self):
        """Load the GLM-ASR model"""
        if self.is_loaded:
            return
            
        try:
            logger.info(f"Loading GLM-ASR model: {self.model_name} on device: {self.device}")
            
            # Load tokenizer
            self.tokenizer = AutoTokenizer.from_pretrained(
                self.model_name,
                trust_remote_code=True
            )
            
            # Load feature extractor
            self.feature_extractor = WhisperFeatureExtractor(**WHISPER_FEAT_CFG)
            
            # Load config and model
            self.config = AutoConfig.from_pretrained(
                self.model_name,
                trust_remote_code=True
            )
            
            self.model = AutoModelForCausalLM.from_pretrained(
                self.model_name,
                config=self.config,
                torch_dtype=torch.bfloat16 if self.device == "cuda" else torch.float32,
                trust_remote_code=True
            ).to(self.device)
            
            self.model.eval()
            
            # Get merge_factor from config
            if hasattr(self.config, 'merge_factor'):
                self.merge_factor = self.config.merge_factor
            
            self.is_loaded = True
            logger.info(f"GLM-ASR model loaded successfully. Merge factor: {self.merge_factor}")
            
        except Exception as e:
            logger.error(f"Failed to load GLM-ASR model: {e}")
            raise
    
    def build_prompt(self, audio_np: np.ndarray, sample_rate: int = 16000, chunk_seconds: int = 30) -> dict:
        """
        Build prompt with audio chunks for GLM-ASR model
        
        Args:
            audio_np: NumPy array of audio samples (float32, normalized to [-1, 1])
            sample_rate: Sample rate of the audio
            chunk_seconds: Length of each audio chunk in seconds
            
        Returns:
            Dictionary with model inputs
        """
        # Convert numpy to torch tensor
        if isinstance(audio_np, np.ndarray):
            wav = torch.from_numpy(audio_np).unsqueeze(0)  # Add channel dimension
        else:
            wav = audio_np.unsqueeze(0) if audio_np.dim() == 1 else audio_np
        
        # Ensure mono
        if wav.shape[0] > 1:
            wav = wav[:1, :]
        
        # Resample if needed
        if sample_rate != self.feature_extractor.sampling_rate:
            resampler = torchaudio.transforms.Resample(sample_rate, self.feature_extractor.sampling_rate)
            wav = resampler(wav)
        
        # Build tokens
        tokens = []
        tokens += self.tokenizer.encode("<|user|>")
        tokens += self.tokenizer.encode("\n")
        
        audios = []
        audio_offsets = []
        audio_length = []
        chunk_size = chunk_seconds * self.feature_extractor.sampling_rate
        
        # Process audio in chunks
        for start in range(0, wav.shape[1], chunk_size):
            chunk = wav[:, start : start + chunk_size]
            
            # Convert to mel spectrogram
            mel = self.feature_extractor(
                chunk.numpy(),
                sampling_rate=self.feature_extractor.sampling_rate,
                return_tensors="pt",
                padding="max_length",
            )["input_features"]
            
            audios.append(mel)
            seconds = chunk.shape[1] / self.feature_extractor.sampling_rate
            num_tokens = get_audio_token_length(seconds, self.merge_factor)
            
            tokens += self.tokenizer.encode("<|begin_of_audio|>")
            audio_offsets.append(len(tokens))
            tokens += [0] * num_tokens
            tokens += self.tokenizer.encode("<|end_of_audio|>")
            audio_length.append(num_tokens)
        
        if not audios:
            raise ValueError("Audio content is empty or failed to load.")
        
        # Add transcription prompt
        tokens += self.tokenizer.encode("<|user|>")
        tokens += self.tokenizer.encode("\nPlease transcribe this audio into text")
        tokens += self.tokenizer.encode("<|assistant|>")
        tokens += self.tokenizer.encode("\n")
        
        batch = {
            "input_ids": torch.tensor([tokens], dtype=torch.long),
            "audios": torch.cat(audios, dim=0),
            "audio_offsets": [audio_offsets],
            "audio_length": [audio_length],
            "attention_mask": torch.ones(1, len(tokens), dtype=torch.long),
        }
        
        return batch
    
    def prepare_inputs(self, batch: dict) -> tuple[dict, int]:
        """Prepare inputs for model generation"""
        tokens = batch["input_ids"].to(self.device)
        attention_mask = batch["attention_mask"].to(self.device)
        audios = batch["audios"].to(self.device)
        
        model_inputs = {
            "inputs": tokens,
            "attention_mask": attention_mask,
            "audios": audios.to(torch.bfloat16 if self.device == "cuda" else torch.float32),
            "audio_offsets": batch["audio_offsets"],
            "audio_length": batch["audio_length"],
        }
        
        return model_inputs, tokens.size(1)
    
    def transcribe_audio(self, audio_data: bytes, sample_rate: int = 16000) -> str:
        """
        Transcribe audio data to text
        
        Args:
            audio_data: Raw audio bytes (PCM format)
            sample_rate: Sample rate of the audio (default: 16000)
            
        Returns:
            Transcribed text
        """
        if not self.is_loaded:
            self.load_model()
        
        try:
            # Convert bytes to numpy array
            audio_np = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
            
            # Build prompt
            batch = self.build_prompt(audio_np, sample_rate)
            
            # Prepare inputs
            model_inputs, prompt_len = self.prepare_inputs(batch)
            
            # Generate transcription
            with torch.inference_mode():
                generated = self.model.generate(
                    **model_inputs,
                    max_new_tokens=128,
                    do_sample=False,
                )
            
            # Decode transcript
            transcript_ids = generated[0, prompt_len:].cpu().tolist()
            transcript = self.tokenizer.decode(transcript_ids, skip_special_tokens=True).strip()
            
            return transcript
            
        except Exception as e:
            logger.error(f"Transcription error: {e}")
            raise
    
    def transcribe_audio_chunk(self, audio_chunk: np.ndarray, sample_rate: int = 16000) -> str:
        """
        Transcribe a single audio chunk (for streaming)
        
        Args:
            audio_chunk: NumPy array of audio samples (float32, normalized to [-1, 1])
            sample_rate: Sample rate of the audio
            
        Returns:
            Transcribed text
        """
        if not self.is_loaded:
            self.load_model()
        
        try:
            # Ensure float32 format and normalize if needed
            if audio_chunk.dtype != np.float32:
                audio_chunk = audio_chunk.astype(np.float32)
            
            # Normalize if needed (assuming int16 range)
            if audio_chunk.max() > 1.0 or audio_chunk.min() < -1.0:
                audio_chunk = audio_chunk / 32768.0
            
            # Build prompt (for streaming, we use smaller chunks or the full chunk)
            # Use the chunk length as the audio duration
            batch = self.build_prompt(audio_chunk, sample_rate, chunk_seconds=30)
            
            # Prepare inputs
            model_inputs, prompt_len = self.prepare_inputs(batch)
            
            # Generate transcription
            with torch.inference_mode():
                generated = self.model.generate(
                    **model_inputs,
                    max_new_tokens=128,
                    do_sample=False,
                )
            
            # Decode transcript
            transcript_ids = generated[0, prompt_len:].cpu().tolist()
            transcript = self.tokenizer.decode(transcript_ids, skip_special_tokens=True).strip()
            
            return transcript
            
        except Exception as e:
            logger.error(f"Chunk transcription error: {e}")
            return ""


# Global ASR service instance
_asr_service: Optional[ASRService] = None


def get_asr_service() -> ASRService:
    """Get or create the global ASR service instance"""
    global _asr_service
    if _asr_service is None:
        _asr_service = ASRService()
    return _asr_service
