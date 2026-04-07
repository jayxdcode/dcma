# Hitori Music Player

A modern, lightweight music streaming app built with React and Vite, featuring YouTube integration via Piped API.

## Features

### Core Functionality
- **Search & Discovery**: Search for music across YouTube with real-time suggestions
- **Playback Controls**: Play, pause, skip, seek, and queue management
- **Player Modes**: Mini player and full-screen player with gesture controls
- **Video Toggle**: Switch between album art view and YouTube video playback in full player
- **Queue Management**: Add tracks, reorder, and manage playback queue
- **Persistent State**: Remembers last played track, queue, and playback position

### Pages & Navigation
- **Home**: Recently played tracks and quick access
- **Search**: Advanced search with filters and sorting
- **Player Full**: Immersive full-screen player with lyrics and related tracks
- **Album**: Browse individual albums with full track listings
- **Playlist**: View and play custom playlists
- **History**: Detailed listening history and statistics
- **Settings**: App configuration and storage management
- **About**: App information and credits

### Advanced Features
- **Related Tracks**: Discover similar music based on current track
- **Endless Playback**: Automatic queue continuation with related tracks (planned)
- **Album Pages**: Browse full albums and artist discography
- **Playlists**: Create and manage custom playlists
- **Detailed History**: Comprehensive playback history with statistics
- **Storage Usage**: Monitor and manage app data usage

### Technical Features
- **Piped API Integration**: Privacy-focused YouTube proxy
- **YouTube IFrame API**: Direct video playback when enabled
- **Responsive Design**: Works on mobile and desktop
- **Offline Support**: Basic offline functionality
- **Gesture Controls**: Swipe gestures for navigation
- **Dark Theme**: Consistent dark UI design

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation
```bash
cd frontend
npm install
npm run dev
```

### Backend Setup
```bash
cd backend
npm install
npm start
```

## Architecture

### Frontend (React + Vite)
- **Components**: Reusable UI components
- **Pages**: Route-based page components
- **Lib**: Core logic, API clients, and context providers
- **Assets**: Static assets and styles

### Backend (Node.js)
- **API Routes**: RESTful endpoints for streaming and metadata
- **YouTube Integration**: Direct YouTube API and Piped proxy
- **Caching**: Response caching for performance

### Key Libraries
- **React**: UI framework
- **Material-UI**: Component library
- **React Router**: Navigation
- **Axios**: HTTP client
- **YouTube IFrame API**: Video playback

## API Endpoints

### Frontend API
- `/api/stream`: Audio streaming proxy
- `/api/search`: Search proxy to Piped
- `/api/suggestions`: Autocomplete suggestions

### Piped API Integration
- Search: `https://piped-api.example.com/search`
- Streams: `https://piped-api.example.com/streams`
- Suggestions: `https://piped-api.example.com/suggestions`

## Development

### Scripts
- `npm run dev`: Start development server
- `npm run build`: Build for production
- `npm run preview`: Preview production build
- `npm run lint`: Run ESLint

### Project Structure
```
frontend/
├── src/
│   ├── components/     # Reusable components
│   ├── pages/         # Page components
│   ├── lib/           # Core logic and APIs
│   └── assets/        # Static assets
├── public/            # Public assets
└── package.json

backend/
├── index.js          # Main server file
├── package.json
└── ...
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Credits

- Built with React and Vite
- YouTube integration via Piped API
- Icons from Material Design Icons
- Fonts from Google Fonts