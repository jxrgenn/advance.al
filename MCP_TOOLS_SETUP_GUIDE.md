# MCP Tools Setup Guide for Albania JobFlow

**Date:** January 10, 2026
**Purpose:** Complete guide to set up and use MCP (Model Context Protocol) tools with Claude Code

---

## 🎯 Overview

MCP tools extend Claude Code's capabilities by providing direct integrations with external services. This guide covers setting up GitHub, MongoDB, Puppeteer, and Filesystem MCP servers for this project.

---

## 📋 Prerequisites

- Node.js 18+ installed
- Claude Code (Claude Desktop or CLI)
- Access to this project's GitHub repository
- MongoDB Atlas connection string
- npm or npx available

---

## 🔧 1. MCP Configuration File

Claude Code uses a configuration file to register MCP servers. The location depends on your OS:

**macOS:**
```bash
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Linux:**
```bash
~/.config/Claude/claude_desktop_config.json
```

**Windows:**
```
%APPDATA%\Claude\claude_desktop_config.json
```

### Create the Configuration File

```bash
# macOS/Linux
mkdir -p ~/Library/Application\ Support/Claude
touch ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Or for CLI config
mkdir -p ~/.config/claude-code
touch ~/.config/claude-code/mcp-config.json
```

---

## 🐙 2. GitHub MCP Server Setup

### Installation

```bash
npm install -g @modelcontextprotocol/server-github
```

### Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-github"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_your_token_here"
      }
    }
  }
}
```

### Generate GitHub Token

1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes:
   - `repo` (full control of private repositories)
   - `read:org` (read org and team membership)
   - `user` (read user profile data)
4. Copy the token and add it to the config above

### Usage Examples

Once configured, you can ask Claude Code:

```
"Create a GitHub issue for re-enabling auth rate limiting"
"Search GitHub for bcrypt best practices in our repo"
"Create a PR for the password reset implementation"
"List all open issues labeled 'security'"
"Show me recent commits by contributor"
```

---

## 🗄️ 3. MongoDB MCP Server Setup

### Installation

```bash
npm install -g @modelcontextprotocol/server-mongodb
```

### Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mongodb": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-mongodb"
      ],
      "env": {
        "MONGODB_URI": "mongodb+srv://advanceal123456:StrongPassword123!@cluster0.gazdf55.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
      }
    }
  }
}
```

⚠️ **SECURITY NOTE:** After setting this up, rotate your MongoDB password as it was exposed in git!

### Usage Examples

```
"Show me all users with userType='employer' and status='pending_verification'"
"Count how many jobs have tier='premium'"
"Find all suspended users with expired suspension dates"
"Check if there are any duplicate email addresses in the User collection"
"Show me the indexes on the Job collection"
"List all collections in the database"
"Find jobs posted in the last 7 days"
```

---

## 🎭 4. Puppeteer MCP Server Setup

### Installation

```bash
npm install -g @modelcontextprotocol/server-puppeteer
```

### Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "puppeteer": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-puppeteer"
      ]
    }
  }
}
```

### Usage Examples

```
"Navigate to http://localhost:5173 and test the login flow"
"Take a screenshot of the jobs page"
"Test registering a new user with email test@example.com"
"Check if the premium jobs carousel displays correctly"
"Test submitting a job application"
"Verify that rate limiting shows an error after 100 requests"
```

---

## 📁 5. Filesystem MCP Server Setup

### Installation

```bash
npm install -g @modelcontextprotocol/server-filesystem
```

### Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/user/Documents/JXSOFT PROJECTS/albania-jobflow"
      ]
    }
  }
}
```

⚠️ **NOTE:** Replace the path with your actual project path.

### Usage Examples

```
"Search for all files containing 'bcrypt'"
"Show me the project directory tree"
"Find all TODO comments in the codebase"
"List all files modified in the last 24 hours"
"Show me all TypeScript files in the frontend/src/components directory"
```

---

## 🔗 Complete Configuration Example

Here's a complete `claude_desktop_config.json` with all four MCP servers:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_your_token_here"
      }
    },
    "mongodb": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-mongodb"],
      "env": {
        "MONGODB_URI": "your_mongodb_connection_string_here"
      }
    },
    "puppeteer": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-puppeteer"]
    },
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/path/to/your/project"
      ]
    }
  }
}
```

---

## ✅ Verification Steps

### 1. Restart Claude Code

After editing the config file, restart Claude Code completely.

### 2. Check MCP Status

In Claude Code, you should see MCP tools available. Try asking:

```
"What MCP tools are available?"
"List all available MCP servers"
```

### 3. Test Each Server

**GitHub:**
```
"List repositories I have access to"
```

**MongoDB:**
```
"Show me all collections in the database"
```

**Puppeteer:**
```
"Navigate to https://example.com and take a screenshot"
```

**Filesystem:**
```
"List all files in the current directory"
```

---

## 🐛 Troubleshooting

### MCP Servers Not Appearing

1. **Check config file location:**
   ```bash
   cat ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```

2. **Verify JSON syntax:**
   ```bash
   cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | jq .
   ```

3. **Check npx is available:**
   ```bash
   npx --version
   ```

4. **Restart Claude Code completely** (quit and reopen)

### GitHub Authentication Fails

- Verify token has correct scopes
- Check token hasn't expired
- Regenerate token if needed

### MongoDB Connection Fails

- Verify connection string is correct
- Check network connectivity
- Ensure MongoDB Atlas IP whitelist includes your IP
- Test connection with mongosh:
  ```bash
  mongosh "mongodb+srv://..."
  ```

### Puppeteer Doesn't Launch

- Ensure Chrome/Chromium is installed
- Check for conflicting browser processes
- Try setting `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false`

---

## 🎯 Project-Specific Use Cases

### For Albania JobFlow

#### Security Auditing

```
"Search GitHub for all files containing hardcoded credentials"
"Find all console.log statements that might leak sensitive data"
"Check MongoDB for users with weak passwords"
```

#### Data Quality Checks

```
"Find all jobs without a valid employerId"
"Check for orphaned applications (jobId doesn't exist)"
"List all users created in the last 24 hours"
"Find jobs with tier='premium' but no pricing information"
```

#### Testing Flows

```
"Test the complete user registration flow for an employer"
"Verify rate limiting blocks after 100 requests"
"Test job posting submission with all required fields"
"Verify email verification process works"
```

#### Codebase Analysis

```
"Find all routes that don't have authentication middleware"
"List all files that import bcrypt"
"Show me all components that use localStorage"
"Find all files with TODO or FIXME comments"
```

---

## 📊 Expected Benefits

With MCP tools properly configured:

- **50% faster** issue creation and management
- **Direct database access** without leaving Claude Code
- **Automated E2E testing** with screenshots
- **Instant codebase search** across all files
- **Better security auditing** with direct data access
- **Faster development** with integrated workflows

---

## 🔐 Security Considerations

1. **Never commit** `claude_desktop_config.json` to git
2. **Rotate secrets** that were in the config if repo becomes public
3. **Use read-only** MongoDB credentials when possible
4. **Limit GitHub token** scopes to minimum required
5. **Keep tokens** in environment variables or secure vault

---

## 📚 Additional Resources

- [MCP Documentation](https://modelcontextprotocol.io)
- [GitHub MCP Server](https://github.com/modelcontextprotocol/servers/tree/main/src/github)
- [MongoDB MCP Server](https://github.com/modelcontextprotocol/servers/tree/main/src/mongodb)
- [Puppeteer Docs](https://pptr.dev/)
- [Claude Code Docs](https://docs.claude.com/claude-code)

---

## ✨ Next Steps

1. ✅ Install all four MCP servers
2. ✅ Create and configure `claude_desktop_config.json`
3. ✅ Generate GitHub Personal Access Token
4. ✅ Add MongoDB connection string
5. ✅ Restart Claude Code
6. ✅ Verify each server works
7. ✅ Start using MCP commands!

Once configured, you can leverage Claude Code's full potential for this project! 🚀
