import { type Tool } from "@modelcontextprotocol/sdk/types.js";

const CONTACTS_TOOL: Tool = {
    name: "contacts",
    description: "Search contacts from Apple Contacts app. Returns names and phone numbers only — email addresses are intentionally never included in responses (privacy by design). To send an email to a contact, use the mail tool with toContactName instead.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name to search for (optional - if not provided, returns all contacts). Can be partial name to search."
        }
      }
    }
  };
  
  const NOTES_TOOL: Tool = {
    name: "notes",
    description: "Search, retrieve and create notes in Apple Notes app",
    annotations: {
      readOnlyHint: false,   // 'create' operation writes new notes
      destructiveHint: false, // only additive — does not delete or overwrite
    },
    inputSchema: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          description: "Operation to perform: 'search', 'list', or 'create'",
          enum: ["search", "list", "create"]
        },
        searchText: {
          type: "string",
          description: "Text to search for in notes (required for search operation)"
        },
        title: {
          type: "string",
          description: "Title of the note to create (required for create operation)"
        },
        body: {
          type: "string",
          description: "Content of the note to create (required for create operation)"
        },
        folderName: {
          type: "string",
          description: "Name of the folder to create the note in (optional for create operation, defaults to 'Claude')"
        }
      },
      required: ["operation"]
    }
  };
  
  const MESSAGES_TOOL: Tool = {
    name: "messages",
    description: "Interact with Apple Messages app - send, read, schedule messages and check unread messages",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true, // 'send'/'schedule' dispatch irreversible iMessages
    },
    inputSchema: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          description: "Operation to perform: 'send', 'read', 'schedule', or 'unread'",
          enum: ["send", "read", "schedule", "unread"]
        },
        phoneNumber: {
          type: "string",
          description: "Phone number to send message to (required for send, read, and schedule operations)"
        },
        message: {
          type: "string",
          description: "Message to send (required for send and schedule operations)"
        },
        limit: {
          type: "number",
          description: "Number of messages to read (optional, for read and unread operations)"
        },
        scheduledTime: {
          type: "string",
          description: "ISO string of when to send the message (required for schedule operation)"
        }
      },
      required: ["operation"]
    }
  };
  
  const MAIL_TOOL: Tool = {
    name: "mail",
    description: "⚠️ IMPORTANT: This is the ONLY email tool. ALL email operations use THIS ONE TOOL with the 'operation' parameter. Call format: mail {operation: X, account?: string, mailbox?: string, limit?: number}. EXAMPLES: mail operation=unreadThreads limit=5 account=Work mailbox=Projects, mail operation=accounts, mail operation=mailboxes account=Work. REF WORKFLOW: mail {operation:'unread'} → results contain 'ref' field → mail {operation:'details', ref:'<ref>'} to read full content, mail {operation:'markRead', ref:'<ref>'} to mark as read, mail {operation:'reply', ref:'<ref>', body:'...'} to reply. Do NOT use apple_mcp_secure_* tools - those are different and don't exist in this server!",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true, // 'send' and 'confirm' dispatch irreversible emails; 'trash' moves to Trash (recoverable)
    },
    inputSchema: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          description: "REQUIRED. Operation to perform. TWO-STEP REF WORKFLOW: First call unread/search/latest → each result contains a 'ref' field. Then pass that ref to details (read full content), reply (send reply), or markRead (mark as read). Example: mail {operation:'unread'} → [{ref:'a1b2c3', subject:'Hello', ...}] → mail {operation:'details', ref:'a1b2c3'} → full email body. Operations: unread=get unread emails, accounts=list all email accounts, mailboxes=list mailboxes for account, search=search emails, latest=get latest emails, send=send email (use prepare+confirm), reply=reply to email (needs ref), trash=trash email, markRead=mark as read (needs ref), prepare=prepare email for safety, confirm=confirm and send prepared email, details=get full email content (needs ref)",
          enum: ["unread", "search", "send", "reply", "mailboxes", "accounts", "latest", "trash", "markRead", "prepare", "confirm", "details"]
        },
        account: {
          type: "string",
          description: "Email account name (e.g. 'Work, Personal, Business'). Use 'mail operation=accounts' to discover all available accounts."
        },
        mailbox: {
          type: "string",
          description: "Mailbox/label name (e.g. 'INBOX', 'Projects', 'Sent', 'Archive', 'Drafts'). Use 'mail operation=mailboxes account=X' to discover available mailboxes for a specific account."
        },
        limit: {
          type: "number",
          description: "Max results to return (RECOMMENDED: always set for large mailboxes!). Default varies by operation (10-50). Works with: unread, unreadThreads, search, latest, mailboxes"
        },
        searchTerm: {
          type: "string",
          description: "Text to search for in emails (required for operation=search). Use with account/mailbox filters for better performance."
        },
        to: {
          type: "string",
          description: "Recipient email address (for operation=send). TIP: Use toContactName instead when recipient is in Contacts to avoid passing the address through the AI."
        },
        toContactName: {
          type: "string",
          description: "Contact name to look up as recipient (alternative to 'to' for operation=send). The server resolves the email address locally and never exposes it."
        },
        subject: {
          type: "string",
          description: "Email subject (required for operation=send)"
        },
        body: {
          type: "string",
          description: "Email body content (required for operation=send)"
        },
        cc: {
          type: "string",
          description: "CC email address (optional, for operation=send)"
        },
        bcc: {
          type: "string",
          description: "BCC email address (optional, for operation=send)"
        },
        trashSubject: {
          type: "string",
          description: "Exact subject of the email to trash (required for operation=trash). Use with trashSender."
        },
        trashSender: {
          type: "string",
          description: "Sender (name or email) of the email to trash — matched as 'contains' (required for operation=trash). Use with trashSubject."
        },
        ref: {
          type: "string",
          description: "Opaque reference to a previously retrieved email (the 'ref' field from unread/unreadThreads/search/latest results). Required for operation=reply, operation=details, and operation=markRead. Lets the server resolve the sender address without exposing it."
        },
        code: {
          type: "string",
          description: "Confirmation code returned by operation=prepare (format: XXXX-XXXX). Required for operation=confirm."
        }
      },
      required: ["operation"]
    }
  };

  const REMINDERS_TOOL: Tool = {
    name: "reminders",
    description: "Search, create, and open reminders in Apple Reminders app",
    annotations: {
      readOnlyHint: false,   // 'create' operation writes new reminders
      destructiveHint: false, // only additive — does not delete existing data
    },
    inputSchema: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          description: "Operation to perform: 'list', 'search', 'open', 'create', or 'listById'",
          enum: ["list", "search", "open", "create", "listById"]
        },
        searchText: {
          type: "string",
          description: "Text to search for in reminders (required for search and open operations)"
        },
        name: {
          type: "string",
          description: "Name of the reminder to create (required for create operation)"
        },
        listName: {
          type: "string",
          description: "Name of the list to create the reminder in (optional for create operation)"
        },
        listId: {
          type: "string",
          description: "ID of the list to get reminders from (required for listById operation)"
        },
        props: {
          type: "array",
          items: {
            type: "string"
          },
          description: "Properties to include in the reminders (optional for listById operation)"
        },
        notes: {
          type: "string",
          description: "Additional notes for the reminder (optional for create operation)"
        },
        dueDate: {
          type: "string",
          description: "Due date for the reminder in ISO format (optional for create operation)"
        }
      },
      required: ["operation"]
    }
  };
  
  
const CALENDAR_TOOL: Tool = {
  name: "calendar",
  description: "Search, create, and open calendar events in Apple Calendar app",
  annotations: {
    readOnlyHint: false,   // 'create' operation writes new calendar events
    destructiveHint: false, // only additive — does not delete existing events
  },
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        description: "Operation to perform: 'search', 'open', 'list', 'create', 'calendars', or 'details'",
        enum: ["search", "open", "list", "create", "calendars", "details"]
      },
      searchText: {
        type: "string",
        description: "Text to search for in event titles, locations, and notes (required for search operation)"
      },
      eventId: {
        type: "string",
        description: "ID of the event to open or retrieve details for (required for open and details operations)"
      },
      limit: {
        type: "number",
        description: "Number of events to retrieve (optional, default 10)"
      },
      fromDate: {
        type: "string",
        description: "Start date for search range in ISO format (optional, default is today)"
      },
      toDate: {
        type: "string",
        description: "End date for search range in ISO format (optional, default is 4 weeks from today)"
      },
      title: {
        type: "string",
        description: "Title of the event to create (required for create operation)"
      },
      startDate: {
        type: "string",
        description: "Start date/time of the event in ISO format (required for create operation)"
      },
      endDate: {
        type: "string",
        description: "End date/time of the event in ISO format (required for create operation)"
      },
      location: {
        type: "string",
        description: "Location of the event (optional for create operation)"
      },
      notes: {
        type: "string",
        description: "Additional notes for the event (optional for create operation)"
      },
      isAllDay: {
        type: "boolean",
        description: "Whether the event is an all-day event (optional for create operation, default is false)"
      },
      calendarName: {
        type: "string",
        description: "Name of the calendar to create the event in (optional for create operation, uses default calendar if not specified)"
      }
    },
    required: ["operation"]
  }
};
  
const MAPS_TOOL: Tool = {
  name: "maps",
  description: "Search locations, manage guides, save favorites, and get directions using Apple Maps",
  annotations: {
    readOnlyHint: false,   // 'save', 'pin', 'createGuide', 'addToGuide' write state
    destructiveHint: false, // no deletions — only additive operations
  },
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        description: "Operation to perform with Maps",
        enum: ["search", "save", "directions", "pin", "listGuides", "addToGuide", "createGuide"]
      },
      query: {
        type: "string",
        description: "Search query for locations (required for search)"
      },
      limit: {
        type: "number",
        description: "Maximum number of results to return (optional for search)"
      },
      name: {
        type: "string",
        description: "Name of the location (required for save and pin)"
      },
      address: {
        type: "string",
        description: "Address of the location (required for save, pin, addToGuide)"
      },
      fromAddress: {
        type: "string",
        description: "Starting address for directions (required for directions)"
      },
      toAddress: {
        type: "string",
        description: "Destination address for directions (required for directions)"
      },
      transportType: {
        type: "string",
        description: "Type of transport to use (optional for directions)",
        enum: ["driving", "walking", "transit"]
      },
      guideName: {
        type: "string",
        description: "Name of the guide (required for createGuide and addToGuide)"
      }
    },
    required: ["operation"]
  }
};

const tools = [CONTACTS_TOOL, NOTES_TOOL, MESSAGES_TOOL, MAIL_TOOL, REMINDERS_TOOL, CALENDAR_TOOL, MAPS_TOOL];

export default tools;
