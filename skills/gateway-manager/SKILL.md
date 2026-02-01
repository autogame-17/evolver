# Gateway Manager

## Description
Handles administrative menu events from Feishu to manage the OpenClaw Gateway service.
Supports remote restart, status monitoring, and system diagnostics.

## Commands
- **Restart Gateway** (`restart_gateway`): Restarts the OpenClaw Gateway service (Master Only).
- **Status** (`status_gateway`): Returns the current status of the gateway (Active/Inactive).
- **System Info** (`system_info`): Displays server metrics (RAM, Uptime, Node version).
- **Test Button** (`test_menu_button`): Triggers a test response (Cute Mode).

## Security
- Critical operations (Restart) are restricted to the authorized Master ID defined in `USER.md`.
- Feedback is provided for unauthorized access attempts.

## Configuration
- Automatically discovers `USER.md` for authorization.
- Uses `feishu-card` for rich feedback.
