# ContextIQ Desktop Application

Electron-based desktop application for ContextIQ.

## Features

- **Main Window**: 2-pane layout with user management and meetings list
- **Meeting Window**: Always-on-top window with opacity for meeting controls
- **User Management**: Full CRUD operations for users
- **Meetings**: View and manage past meetings

## Development

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

```bash
cd frontend
npm install
```

### Running the Application

```bash
npm start
```

For development with DevTools:

```bash
npm run dev
```

### Building

```bash
npm run build
```

## Project Structure

```
frontend/
├── src/
│   ├── main/              # Main process (Electron)
│   │   └── main.js        # Window management and IPC
│   ├── preload/           # Preload scripts (bridge between main and renderer)
│   │   ├── main-preload.js
│   │   └── meeting-preload.js
│   ├── renderer/          # Renderer processes (UI)
│   │   ├── main-window/   # Main window UI
│   │   └── meeting-window/ # Meeting window UI
│   └── api/               # API client
│       └── api.js
├── package.json
└── README.md
```

## API Integration

The frontend connects to the backend API running on `http://localhost:5000` by default. Make sure the backend is running before starting the frontend.

## Window Behavior

- **Main Window**: Standard window with 2-pane layout
- **Meeting Window**: 
  - Always on top (OS-level flags)
  - Opacity set to 0.7
  - Minimizes main window when opened
  - Restores main window when closed

