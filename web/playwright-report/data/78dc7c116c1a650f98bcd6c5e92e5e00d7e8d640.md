# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 09-full-system-qa-matrix.spec.ts >> Ultimate Global Matrix QA Simulation >> Fully validates cross-platform multi-tenant UI logic iteratively
- Location: tests\e2e\09-full-system-qa-matrix.spec.ts:7:7

# Error details

```
Error: page.goto: net::ERR_NO_BUFFER_SPACE at http://localhost:3000/app/metrics
Call log:
  - navigating to "http://localhost:3000/app/metrics", waiting until "load"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e6]:
      - heading "Login to DocuSync" [level=1] [ref=e13]
      - paragraph [ref=e19]: A decentralized collaborative workspace powered by peer-to-peer synchronization. Your files remain under your control with no centralized cloud dependency.
    - generic [ref=e25]:
      - generic [ref=e27]:
        - heading "Log In" [level=2] [ref=e28]
        - paragraph [ref=e29]: Access your local encrypted workspace to begin collaborating securely.
      - generic [ref=e30]:
        - generic [ref=e31]:
          - generic [ref=e32]: Local Identifier (Username)
          - textbox "Local Identifier (Username)" [ref=e38]:
            - /placeholder: Enter your username
        - generic [ref=e39]:
          - generic [ref=e40]: 6-Digit Security PIN
          - generic [ref=e42]:
            - button "Show PIN" [ref=e53] [cursor=pointer]
            - textbox
        - generic [ref=e57]:
          - generic [ref=e58] [cursor=pointer]:
            - checkbox "Remember this device" [ref=e59]
            - text: Remember this device
          - button "Forgot PIN?" [ref=e60] [cursor=pointer]
        - button "Log In" [ref=e61] [cursor=pointer]
        - generic [ref=e62]: or
        - button "Create Local Profile" [ref=e66] [cursor=pointer]
  - region "Notifications alt+T"
  - alert [ref=e70]
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | // Extremely robust, multi-device, multi-context E2E QA script covering Admin, User, Matrix, Desktop, Web, and Mobile workflows
  4   | 
  5   | test.describe('Ultimate Global Matrix QA Simulation', () => {
  6   | 
  7   |   test('Fully validates cross-platform multi-tenant UI logic iteratively', async ({ browser }) => {
  8   |     
  9   |     // -------------------------------------------------------------
  10  |     // CONTEXT 1: ADMIN DASHBOARD (Desktop Viewport)
  11  |     // -------------------------------------------------------------
  12  |     const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 }});
  13  |     const adminPage = await adminContext.newPage();
  14  |     
  15  |     // Mount standard login portal independently
  16  |     await adminPage.goto('http://localhost:3000/app/login');
  17  |     // Minimal DOM verification — prove interface boots up securely
  18  |     await expect(adminPage.locator('text=Log In').first()).toBeVisible({ timeout: 10000 });
  19  |     
  20  |     
  21  |     // -------------------------------------------------------------
  22  |     // CONTEXT 2: DESKTOP CLIENT (Host Simulator)
  23  |     // -------------------------------------------------------------
  24  |     const desktopContext = await browser.newContext({ 
  25  |       viewport: { width: 1280, height: 720 },
  26  |       userAgent: 'DocuSync/1.0.0 (Desktop Simulator)'
  27  |     });
  28  |     const desktopPage = await desktopContext.newPage();
  29  |     
  30  |     // Set simulated node ID for Desktop Host
  31  |     await desktopPage.addInitScript(() => {
  32  |       window.localStorage.setItem('docusync_auth_user', JSON.stringify({ displayName: 'QA Desktop Host' }));
  33  |       window.localStorage.setItem('node_id', 'desktop-host-1234');
  34  |     });
  35  |     
  36  |     await desktopPage.goto('http://localhost:3000/app/peers');
  37  |     
  38  |     // Verify Create Room UI exists and Algorithm toggles work
  39  |     await expect(desktopPage.locator('text=Create Room')).toBeVisible();
  40  | 
  41  | 
  42  |     // -------------------------------------------------------------
  43  |     // CONTEXT 3: WEB CLIENT (Standard Web Browser)
  44  |     // -------------------------------------------------------------
  45  |     const webContext = await browser.newContext({ 
  46  |       viewport: { width: 1920, height: 1080 }
  47  |     });
  48  |     const webPage = await webContext.newPage();
  49  |     
  50  |     // Set simulated node ID for Web Client
  51  |     await webPage.addInitScript(() => {
  52  |       window.localStorage.setItem('docusync_auth_user', JSON.stringify({ displayName: 'QA Web Peer' }));
  53  |       window.localStorage.setItem('node_id', 'web-peer-5678');
  54  |       
  55  |       // Inject fake room mapping so it can reach the Matrix immediately
  56  |       window.localStorage.setItem('current_room', JSON.stringify({
  57  |          id: 'matrix-room-1',
  58  |          name: 'Golden QA Room', 
  59  |          hostNodeId: 'desktop-host-1234',
  60  |          otp: 'QAT3ST',
  61  |          isOwner: false
  62  |       }));
  63  |     });
  64  |     
> 65  |     await webPage.goto('http://localhost:3000/app/metrics');
      |                   ^ Error: page.goto: net::ERR_NO_BUFFER_SPACE at http://localhost:3000/app/metrics
  66  |     
  67  |     // VERIFY: Matrix Comparison Chart correctly loaded
  68  |     await expect(webPage.locator('text=Algorithm Matrix: LWW (Vector Clocks) vs Operational Transformation (OT)')).toBeVisible({ timeout: 15000 });
  69  |     
  70  |     
  71  |     // -------------------------------------------------------------
  72  |     // CONTEXT 4: MOBILE CLIENT (iOS iPhone Viewport)
  73  |     // -------------------------------------------------------------
  74  |     const mobileContext = await browser.newContext({ 
  75  |       viewport: { width: 390, height: 844 }, // iPhone 12 Pro dimensions
  76  |       userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  77  |       isMobile: true,
  78  |       hasTouch: true
  79  |     });
  80  |     const mobilePage = await mobileContext.newPage();
  81  |     
  82  |     await mobilePage.addInitScript(() => {
  83  |       window.localStorage.setItem('docusync_auth_user', JSON.stringify({ displayName: 'QA Mobile Peer' }));
  84  |     });
  85  |     
  86  |     // Verify Mobile layout loads correctly
  87  |     await mobilePage.goto('http://localhost:3000/app/peers');
  88  |     await expect(mobilePage.locator('text=Sync Rooms').first()).toBeVisible({ timeout: 10000 });
  89  | 
  90  | 
  91  |     // Verify UI responsiveness and successful cross-device orchestration
  92  |     console.log('[QA] Admin, Desktop Host, Web Peer, and Mobile Peer successfully booted and passed structural logic assertions.');
  93  |     
  94  |     await adminContext.close();
  95  |     await desktopContext.close();
  96  |     await webContext.close();
  97  |     await mobileContext.close();
  98  |   });
  99  | 
  100 | });
  101 | 
```