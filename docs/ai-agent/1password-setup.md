# 1Password Setup for Trading Mode

This guide walks through storing your Stellar secret key in 1Password and configuring agent-bridge to resolve it at runtime. Your secret key is never stored in plain text in any file.

## Why 1Password?

The `ADMIN_SECRET` environment variable holds the Stellar secret key that signs all on-chain admin transactions. Storing it as a plain `S...` value in `.env` means it appears in your shell history, is readable by any process, and can leak via version control.

With 1Password CLI (`op`), `.env` stores an `op://` reference instead of the secret itself. The `op run` command resolves references at startup and injects the real values into the process environment.

---

## Step A — Install 1Password CLI

**macOS (Homebrew):**
```bash
brew install 1password-cli
op --version   # confirm: 2.x.x
```

**Linux (Debian/Ubuntu):**
```bash
curl -sS https://downloads.1password.com/linux/keys/1password.asc \
  | sudo gpg --dearmor -o /usr/share/keyrings/1password-archive-keyring.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/1password-archive-keyring.gpg] \
  https://downloads.1password.com/linux/debian/$(dpkg --print-architecture) stable main" \
  | sudo tee /etc/apt/sources.list.d/1password.list

sudo apt update && sudo apt install 1password-cli
op --version
```

**Windows:** Download from https://developer.1password.com/docs/cli/get-started/

---

## Step B — Sign in to 1Password

```bash
op signin
```

If this is your first device:
```bash
op account add
# Follow the prompts: sign-in address, email, secret key, master password
```

Confirm you're signed in:
```bash
op vault list
# Should list your vaults
```

---

## Step C — Create a vault and store the secret

```bash
# Create a dedicated vault
op vault create StellarTrading

# Store your Stellar secret key
op item create \
  --vault StellarTrading \
  --category Password \
  --title AdminKey \
  --field-name credential \
  --value SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

Replace the `SXXX...` value with your actual Stellar secret key.

Confirm it was stored:
```bash
op item list --vault StellarTrading
# Should show: AdminKey
```

---

## Step D — Update `.env` to use an `op://` reference

Open `agent-bridge/.env` (or create it):

**Before:**
```env
ADMIN_SECRET=SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

**After:**
```env
ADMIN_SECRET=op://StellarTrading/AdminKey/credential
```

The format is `op://VAULT/ITEM/FIELD`.

---

## Step E — Test secret resolution

```bash
cd agent-bridge
op run --env-file=.env -- printenv ADMIN_SECRET
```

This should print your actual `S...` secret key (not the `op://` reference). If it prints the reference, check that you're signed in (`op vault list`) and the vault/item/field names match exactly.

---

## Step F — Start agent-bridge with secret injection

Always start the bridge via `op run`:

```bash
cd agent-bridge
op run --env-file=.env -- /usr/local/go/bin/go run .
```

Or, if you have a compiled binary:
```bash
op run --env-file=.env -- ./app
```

The bridge process receives `ADMIN_SECRET` as a real secret key. `op run` never writes it to disk.

---

## Storing additional secrets

If you have other secrets (e.g. a separate settlement token key):

```bash
op item create \
  --vault StellarTrading \
  --category Password \
  --title SettlementToken \
  --field-name credential \
  --value CXXX...
```

Then in `.env`:
```env
SETTLEMENT_TOKEN=op://StellarTrading/SettlementToken/credential
```

---

## Reference links

- [Get started with 1Password CLI](https://developer.1password.com/docs/cli/get-started/)
- [Secret references (`op://`)](https://developer.1password.com/docs/cli/secret-references/)
- [op run command](https://developer.1password.com/docs/cli/reference/commands/run/)
- [AI agent integration guide](https://developer.1password.com/docs/sdks/ai-agent/)

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `op: command not found` | Install CLI (Step A) |
| `[ERROR] Authorization required` | Run `op signin` |
| `op run` prints the `op://` reference | Check vault/item/field names match exactly |
| `ADMIN_SECRET` empty in bridge | Confirm you used `op run --env-file=.env --` not just `go run .` |
