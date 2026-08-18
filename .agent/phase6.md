Implement Firebase Cloud Messaging push notifications.

The React Native app will later register its device token with the backend.

Implement:
- NotificationDevice model
- register device endpoint
- remove device endpoint
- Firebase Admin SDK integration
- safe Firebase credentials configuration

Notification events:
- Telegram expense successfully confirmed
- budget warning threshold reached
- savings/financial alerts where appropriate

Requirements:
- Notification failure must NEVER make transaction creation fail.
- Handle invalid/expired FCM tokens.
- Remove unusable tokens safely.
- Avoid duplicate push notifications.
- Never expose Firebase service credentials.
- Add tests with mocked Firebase provider.