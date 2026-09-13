# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 04-multi-user-lww-editing.spec.ts >> Suite 4 — Multi-User LWW Concurrent Editing >> E — Offline/Reconnect: offline edits queue then sync on reconnect
- Location: tests\e2e\04-multi-user-lww-editing.spec.ts:328:7

# Error details

```
Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [active] [ref=f1e1]:
  - generic [ref=f1e3]:
    - generic [ref=f1e6]:
      - heading "Login to DocuSync" [level=1] [ref=f1e13]
      - paragraph [ref=f1e19]: A decentralized collaborative workspace powered by peer-to-peer synchronization. Your files remain under your control with no centralized cloud dependency.
    - generic [ref=f1e25]:
      - generic [ref=f1e27]:
        - heading "Log In" [level=2] [ref=f1e28]
        - paragraph [ref=f1e29]: Access your local encrypted workspace to begin collaborating securely.
      - generic [ref=f1e30]:
        - generic [ref=f1e31]:
          - generic [ref=f1e32]: Local Identifier (Username)
          - textbox "Local Identifier (Username)" [ref=f1e38]:
            - /placeholder: Enter your username
        - generic [ref=f1e39]:
          - generic [ref=f1e40]: 6-Digit Security PIN
          - generic [ref=f1e42]:
            - button "Show PIN" [ref=f1e53] [cursor=pointer]
            - textbox
        - generic [ref=f1e57]:
          - generic [ref=f1e58] [cursor=pointer]:
            - checkbox "Remember this device" [ref=f1e59]
            - text: Remember this device
          - button "Forgot PIN?" [ref=f1e60] [cursor=pointer]
        - button "Log In" [ref=f1e61] [cursor=pointer]
        - generic [ref=f1e62]: or
        - button "Create Local Profile" [ref=f1e66] [cursor=pointer]
  - region "Notifications alt+T"
  - alert [ref=f1e70]
```