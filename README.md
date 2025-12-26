# Micro - Node.js HTTP Server

A simple HTTP server built with Node.js.

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm (comes with Node.js)

### Installation

1. Install dependencies (if any):
```bash
npm install
```

### Running the Server

Start the server:
```bash
npm start
```

Or run directly:
```bash
node index.js
```

The server will start on `http://localhost:3000` by default. You can change the port by setting the `PORT` environment variable:

```bash
PORT=8080 npm start
```

### API Endpoints

- `GET /` - Returns a welcome message
- `GET /health` - Health check endpoint

### Example Requests

```bash
# Get welcome message
curl http://localhost:3000/

# Health check
curl http://localhost:3000/health
```

## Project Structure

```
micro/
├── index.js          # Main server file
├── package.json      # Project metadata and scripts
├── .gitignore       # Git ignore file
└── README.md        # This file
```

