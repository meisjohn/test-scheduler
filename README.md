# Test Scheduler

A real-time, MERN-stack based scheduling application for managing test activities across different test strings, shifts, and days.

## Features

- **Real-time Collaboration**: Updates are reflected instantly across all connected clients using Socket.io.
- **Flexible Grid**: Schedule tests by Shift and Test String.
- **Backlog Management**: Stage activities before scheduling them.
- **Configuration**: Customize test strings, locations, shifts, and holidays per week or globally.
- **System Maintenance**: Backup/Restore and Archiving capabilities.

## Getting Started

### Prerequisites

- Node.js (v18+)
- MongoDB (Local or Atlas)
- Docker (Optional)

### Running with Docker (Recommended)

1. Ensure Docker Desktop is running.
2. Run the following command in the root directory:
   ```bash
   docker-compose up --build
   ```
3. Access the application at `http://localhost:3000`.

### Running Manually

1. **Backend**:
   ```bash
   cd backend
   npm install
   # Ensure MongoDB is running on localhost:27017
   npm start
   ```

2. **Frontend**:
   ```bash
   cd frontend
   npm install
   npm start
   ```

## Usage Guide

### 1. Adding Activities

There are two ways to add activities to the schedule:

*   **Via Backlog (Staging)**:
    1.  In the left sidebar, type a title into the "Add test..." input.
    2.  Click **+ STAGE**.
    3.  The item appears in the backlog list.
    4.  Click the item to select it (it turns yellow), then click a cell in the grid to schedule it.

*   **Direct to Grid**:
    1.  Ensure the week is **Unlocked** (Top bar toggle).
    2.  Click any empty cell in the grid.
    3.  Enter the title in the prompt.
    4.  The activity is created and scheduled immediately.

### 2. Updating Week Configuration

You can customize the rows (Test Strings) and metadata for the specific week you are viewing.

1.  Click the **Settings (Gear Icon)** in the top-left of the sidebar.
2.  **Test Strings**: Add, rename, or delete test strings (rows). Renaming a string updates all activities in that row automatically.
3.  **Locations**: Manage the list of available environments/locations.
4.  **Holidays**: Add company-specific holidays for the week.
5.  **Notes/Links**: Add high-level goals or links to external documentation.

### 3. Updating Global Configuration

To ensure future weeks start with a specific setup:

1.  Configure the current week exactly how you want the default to be.
2.  Open **Settings**.
3.  Scroll down and click **Promote to Global Template**.
4.  Any *newly* accessed week (that hasn't been visited before) will now inherit this configuration.

### 4. System Maintenance

Located at the bottom of the **Settings** panel:

*   **Export System Backup**: Downloads a full JSON dump of the database (Activities, Configs, Global Settings).
*   **Import System Backup**: Restores the database from a JSON file. **Warning**: This wipes existing data before importing.
*   **Archive & Prune**:
    1.  Specify a number of weeks (e.g., 12).
    2.  Click "Run Archive & Prune".
    3.  The system downloads a JSON file of old data and removes it from the live database to keep performance high.
*   **Restore from Archive**: Merges archived data back into the active view without overwriting current configurations.
