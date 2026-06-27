// Integration Registry
// 5 fully implemented: slack, stripe, gmail, whatsapp, webhook
// 3 stubbed: notion, jira, github

export type AuthType = "oauth2" | "api_key" | "webhook_secret" | "none";

export type TriggerDescriptor = {
  id: string;
  description: string;
  entityEvents: Array<"created" | "updated" | "deleted" | "status_changed">;
};

export type ActionInputField = {
  name: string;
  type: string;
  required: boolean;
  description: string;
};

export type ActionDescriptor = {
  id: string;
  description: string;
  inputSchema: ActionInputField[];
  outputSchema: ActionInputField[];
};

export type Integration = {
  id: string;
  displayName: string;
  authType: AuthType;
  implemented: boolean;
  stubNote?: string;
  triggers: TriggerDescriptor[];
  actions: ActionDescriptor[];
};

export const INTEGRATION_REGISTRY: Record<string, Integration> = {
  // ── FULLY IMPLEMENTED ─────────────────────────────────────────────────────

  slack: {
    id: "slack",
    displayName: "Slack",
    authType: "oauth2",
    implemented: true,
    triggers: [
      {
        id: "record_created",
        description: "Triggered when a record is created",
        entityEvents: ["created"],
      },
      {
        id: "record_updated",
        description: "Triggered when a record is updated",
        entityEvents: ["updated"],
      },
      {
        id: "status_changed",
        description: "Triggered when an entity status field changes",
        entityEvents: ["status_changed"],
      },
    ],
    actions: [
      {
        id: "send_channel_message",
        description: "Post a message to a Slack channel",
        inputSchema: [
          { name: "channel", type: "string", required: true, description: "Slack channel ID or name (e.g. #general)" },
          { name: "text", type: "string", required: true, description: "Message text (supports Slack markdown)" },
          { name: "blocks", type: "object[]", required: false, description: "Optional Block Kit blocks for rich formatting" },
        ],
        outputSchema: [
          { name: "ts", type: "string", required: true, description: "Message timestamp (also serves as message ID)" },
          { name: "channel", type: "string", required: true, description: "Channel the message was posted to" },
        ],
      },
      {
        id: "send_dm",
        description: "Send a direct message to a Slack user",
        inputSchema: [
          { name: "userId", type: "string", required: true, description: "Slack user ID (e.g. U012AB3CD)" },
          { name: "text", type: "string", required: true, description: "Message text" },
        ],
        outputSchema: [
          { name: "ts", type: "string", required: true, description: "Message timestamp" },
        ],
      },
    ],
  },

  stripe: {
    id: "stripe",
    displayName: "Stripe",
    authType: "api_key",
    implemented: true,
    triggers: [
      {
        id: "payment_event",
        description: "Triggered on subscription or payment events",
        entityEvents: ["created", "updated", "status_changed"],
      },
    ],
    actions: [
      {
        id: "create_customer",
        description: "Create a new Stripe customer",
        inputSchema: [
          { name: "email", type: "string", required: true, description: "Customer email" },
          { name: "name", type: "string", required: false, description: "Customer full name" },
          { name: "metadata", type: "object", required: false, description: "Key-value metadata (e.g. { appUserId: '...' })" },
        ],
        outputSchema: [
          { name: "customerId", type: "string", required: true, description: "Stripe customer ID (cus_...)" },
        ],
      },
      {
        id: "create_subscription",
        description: "Create a subscription for an existing customer",
        inputSchema: [
          { name: "customerId", type: "string", required: true, description: "Stripe customer ID" },
          { name: "priceId", type: "string", required: true, description: "Stripe price ID (price_...)" },
          { name: "trialDays", type: "number", required: false, description: "Number of trial days" },
        ],
        outputSchema: [
          { name: "subscriptionId", type: "string", required: true, description: "Stripe subscription ID (sub_...)" },
          { name: "status", type: "string", required: true, description: "Subscription status" },
        ],
      },
      {
        id: "issue_refund",
        description: "Issue a full or partial refund for a charge",
        inputSchema: [
          { name: "chargeId", type: "string", required: true, description: "Stripe charge ID (ch_...)" },
          { name: "amount", type: "number", required: false, description: "Amount to refund in cents. Omit for full refund." },
          { name: "reason", type: "string", required: false, description: "Refund reason: duplicate | fraudulent | requested_by_customer" },
        ],
        outputSchema: [
          { name: "refundId", type: "string", required: true, description: "Stripe refund ID (re_...)" },
          { name: "status", type: "string", required: true, description: "Refund status" },
        ],
      },
    ],
  },

  gmail: {
    id: "gmail",
    displayName: "Gmail / Google Workspace",
    authType: "oauth2",
    implemented: true,
    triggers: [
      {
        id: "record_event",
        description: "Triggered on any record event",
        entityEvents: ["created", "updated", "status_changed"],
      },
    ],
    actions: [
      {
        id: "send_email",
        description: "Send an email via Gmail",
        inputSchema: [
          { name: "to", type: "string", required: true, description: "Recipient email address" },
          { name: "subject", type: "string", required: true, description: "Email subject line" },
          { name: "body", type: "string", required: true, description: "Email body (HTML supported)" },
          { name: "cc", type: "string", required: false, description: "CC recipients (comma-separated)" },
        ],
        outputSchema: [
          { name: "messageId", type: "string", required: true, description: "Gmail message ID" },
          { name: "threadId", type: "string", required: true, description: "Gmail thread ID" },
        ],
      },
      {
        id: "create_calendar_event",
        description: "Create a Google Calendar event",
        inputSchema: [
          { name: "title", type: "string", required: true, description: "Event title" },
          { name: "startTime", type: "string", required: true, description: "ISO 8601 start time" },
          { name: "endTime", type: "string", required: true, description: "ISO 8601 end time" },
          { name: "attendees", type: "string[]", required: false, description: "List of attendee email addresses" },
          { name: "description", type: "string", required: false, description: "Event description" },
        ],
        outputSchema: [
          { name: "eventId", type: "string", required: true, description: "Google Calendar event ID" },
          { name: "htmlLink", type: "string", required: true, description: "URL to the event in Google Calendar" },
        ],
      },
    ],
  },

  whatsapp: {
    id: "whatsapp",
    displayName: "WhatsApp (via Twilio)",
    authType: "api_key",
    implemented: true,
    triggers: [
      {
        id: "user_action",
        description: "Triggered by a user action in the app",
        entityEvents: ["created", "status_changed"],
      },
    ],
    actions: [
      {
        id: "send_template_message",
        description: "Send a WhatsApp template message via Twilio",
        inputSchema: [
          { name: "to", type: "string", required: true, description: "Recipient phone number (E.164 format, e.g. +1234567890)" },
          { name: "templateSid", type: "string", required: true, description: "Twilio Content SID for the approved template" },
          { name: "variables", type: "object", required: false, description: "Template variable substitutions (e.g. { '1': 'John', '2': 'Deal #42' })" },
        ],
        outputSchema: [
          { name: "messageSid", type: "string", required: true, description: "Twilio message SID" },
          { name: "status", type: "string", required: true, description: "Message delivery status" },
        ],
      },
      {
        id: "send_notification",
        description: "Send a freeform WhatsApp notification (for opt-in users in 24hr window)",
        inputSchema: [
          { name: "to", type: "string", required: true, description: "Recipient phone number (E.164)" },
          { name: "text", type: "string", required: true, description: "Notification text (max 1600 chars)" },
        ],
        outputSchema: [
          { name: "messageSid", type: "string", required: true, description: "Twilio message SID" },
        ],
      },
    ],
  },

  webhook: {
    id: "webhook",
    displayName: "Webhook (Generic)",
    authType: "webhook_secret",
    implemented: true,
    triggers: [
      {
        id: "any_trigger",
        description: "Can be triggered by any entity event",
        entityEvents: ["created", "updated", "deleted", "status_changed"],
      },
    ],
    actions: [
      {
        id: "post_payload",
        description: "POST a signed JSON payload to a configured URL",
        inputSchema: [
          { name: "url", type: "string", required: true, description: "Target webhook URL" },
          { name: "payload", type: "object", required: true, description: "JSON payload to send" },
          { name: "secret", type: "string", required: false, description: "HMAC signing secret (used to compute X-Signature header)" },
          { name: "headers", type: "object", required: false, description: "Additional HTTP headers to include" },
        ],
        outputSchema: [
          { name: "statusCode", type: "number", required: true, description: "HTTP response status code from target" },
          { name: "responseBody", type: "string", required: false, description: "Response body from target (if any)" },
        ],
      },
    ],
  },

  // ── STUBBED ───────────────────────────────────────────────────────────────

  notion: {
    id: "notion",
    displayName: "Notion",
    authType: "oauth2",
    implemented: false,
    stubNote: "Registry and schema defined. HTTP calls not implemented. Implement using Notion API at https://developers.notion.com/reference",
    triggers: [
      {
        id: "data_change",
        description: "Triggered on data change events",
        entityEvents: ["created", "updated"],
      },
    ],
    actions: [
      {
        id: "create_page",
        description: "Create a new Notion page in a database",
        inputSchema: [
          { name: "databaseId", type: "string", required: true, description: "Notion database ID" },
          { name: "properties", type: "object", required: true, description: "Page properties matching the database schema" },
        ],
        outputSchema: [
          { name: "pageId", type: "string", required: true, description: "Notion page ID" },
          { name: "url", type: "string", required: true, description: "URL to the new page" },
        ],
      },
    ],
  },

  jira: {
    id: "jira",
    displayName: "Jira",
    authType: "api_key",
    implemented: false,
    stubNote: "Registry and schema defined. HTTP calls not implemented. Implement using Atlassian REST API v3.",
    triggers: [
      {
        id: "task_event",
        description: "Triggered on task or issue events",
        entityEvents: ["created", "updated", "status_changed"],
      },
    ],
    actions: [
      {
        id: "create_issue",
        description: "Create a Jira issue",
        inputSchema: [
          { name: "projectKey", type: "string", required: true, description: "Jira project key (e.g. ENG)" },
          { name: "summary", type: "string", required: true, description: "Issue summary/title" },
          { name: "issueType", type: "string", required: true, description: "Issue type: Bug | Story | Task | Epic" },
          { name: "description", type: "string", required: false, description: "Issue description (Atlassian Document Format)" },
          { name: "assignee", type: "string", required: false, description: "Assignee account ID" },
        ],
        outputSchema: [
          { name: "issueKey", type: "string", required: true, description: "Jira issue key (e.g. ENG-42)" },
          { name: "issueId", type: "string", required: true, description: "Jira issue ID" },
        ],
      },
    ],
  },

  github: {
    id: "github",
    displayName: "GitHub",
    authType: "api_key",
    implemented: false,
    stubNote: "Registry and schema defined. HTTP calls not implemented. Implement using GitHub REST API v3.",
    triggers: [
      {
        id: "dev_workflow",
        description: "Triggered by development workflow events",
        entityEvents: ["created", "updated"],
      },
    ],
    actions: [
      {
        id: "create_issue",
        description: "Create a GitHub issue",
        inputSchema: [
          { name: "owner", type: "string", required: true, description: "Repository owner (user or org)" },
          { name: "repo", type: "string", required: true, description: "Repository name" },
          { name: "title", type: "string", required: true, description: "Issue title" },
          { name: "body", type: "string", required: false, description: "Issue body (Markdown)" },
          { name: "labels", type: "string[]", required: false, description: "Label names to apply" },
        ],
        outputSchema: [
          { name: "issueNumber", type: "number", required: true, description: "GitHub issue number" },
          { name: "htmlUrl", type: "string", required: true, description: "URL to the issue" },
        ],
      },
    ],
  },
};