const fs = require('fs');
const path = require('path');

const files = [
    "c:\\Users\\Paul John Palamara\\Downloads\\ThesisSync\\web\\src\\app\\home\\page.tsx",
    "c:\\Users\\Paul John Palamara\\Downloads\\ThesisSync\\web\\src\\components\\Navbar.tsx",
    "c:\\Users\\Paul John Palamara\\Downloads\\ThesisSync\\web\\src\\components\\Footer.tsx",
    "c:\\Users\\Paul John Palamara\\Downloads\\ThesisSync\\web\\src\\components\\ClientLayoutWrapper.tsx"
];

const replacements = {
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
};

for (const file of files) {
    if (!fs.existsSync(file)) continue;
    let content = fs.readFileSync(file, 'utf8');

    for (const [oldVal, newVal] of Object.entries(replacements)) {
        content = content.split(oldVal).join(newVal);
    }
    
    // Also handle strings without quotes (for template literals or regular strings)
    content = content.split("rgba(255,255,255,0.03)").join("var(--s1)");
    content = content.split("rgba(255,255,255,0.04)").join("var(--s1)");
    content = content.split("rgba(255,255,255,0.05)").join("var(--s1)");
    content = content.split("rgba(255,255,255,0.08)").join("var(--b1)");
    content = content.split("rgba(255,255,255,0.10)").join("var(--b1)");
    content = content.split("rgba(255,255,255,0.12)").join("var(--b1)");
    content = content.split("rgba(255,255,255,0.20)").join("var(--b2)");
    content = content.split("rgba(10,14,24,0.90)").join("var(--bg)");
    content = content.split("#0a0e18").join("var(--bg)");
    content = content.split("#111827").join("var(--bg2)");
    content = content.split("#1a2235").join("var(--bg3)");
    content = content.split("#eef0f8").join("var(--t1)");
    content = content.split("#7e8ba8").join("var(--t2)");
    content = content.split("#4d5f85").join("var(--t3)");

    fs.writeFileSync(file, content, 'utf8');
}

console.log("Done replacing colors.");
