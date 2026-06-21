import os
import re

files = [
    r"c:\Users\Paul John Palamara\Downloads\ThesisSync\web\src\app\home\page.tsx",
    r"c:\Users\Paul John Palamara\Downloads\ThesisSync\web\src\components\Navbar.tsx",
    r"c:\Users\Paul John Palamara\Downloads\ThesisSync\web\src\components\Footer.tsx",
    r"c:\Users\Paul John Palamara\Downloads\ThesisSync\web\src\components\ClientLayoutWrapper.tsx"
]

replacements = {
    "'#0a0e18'": "'var(--bg)'",
    "'#111827'": "'var(--bg2)'",
    "'#1a2235'": "'var(--bg3)'",
    "'#eef0f8'": "'var(--t1)'",
    "'#7e8ba8'": "'var(--t2)'",
    "'#4d5f85'": "'var(--t3)'",
    "'#3d4a65'": "'var(--t3)'",
    "'rgba(255,255,255,0.03)'": "'var(--s1)'",
    "'rgba(255,255,255,0.04)'": "'var(--s1)'",
    "'rgba(255,255,255,0.05)'": "'var(--s1)'",
    "'rgba(255,255,255,0.08)'": "'var(--b1)'",
    "'rgba(255,255,255,0.10)'": "'var(--b1)'",
    "'rgba(255,255,255,0.12)'": "'var(--b1)'",
    "'rgba(255,255,255,0.20)'": "'var(--b2)'",
    "'rgba(255,255,255,0.35)'": "'var(--b2)'",
    "'rgba(10,14,24,0.90)'": "'var(--bg)'"
}

for file_path in files:
    if not os.path.exists(file_path):
        continue
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    for old, new in replacements.items():
        content = content.replace(old, new)
        
    # Also handle some string interpolation ones if they exist:
    # e.g., `1px solid rgba(255,255,255,0.08)` -> `1px solid var(--b1)`
    content = content.replace("rgba(255,255,255,0.03)", "var(--s1)")
    content = content.replace("rgba(255,255,255,0.04)", "var(--s1)")
    content = content.replace("rgba(255,255,255,0.05)", "var(--s1)")
    content = content.replace("rgba(255,255,255,0.08)", "var(--b1)")
    content = content.replace("rgba(255,255,255,0.10)", "var(--b1)")
    content = content.replace("rgba(255,255,255,0.12)", "var(--b1)")
    content = content.replace("rgba(255,255,255,0.20)", "var(--b2)")
    content = content.replace("rgba(10,14,24,0.90)", "var(--bg)")
    content = content.replace("#0a0e18", "var(--bg)")
    content = content.replace("#111827", "var(--bg2)")
    content = content.replace("#1a2235", "var(--bg3)")
    content = content.replace("#eef0f8", "var(--t1)")
    content = content.replace("#7e8ba8", "var(--t2)")
    content = content.replace("#4d5f85", "var(--t3)")

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

print("Done replacing colors.")
