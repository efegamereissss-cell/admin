import re
with open('index.html', encoding='utf-8') as f:
    code = f.read()
m = re.search(r'<script type="module">(.*?)</script>', code, re.DOTALL)
if m:
    with open('test.js', 'w', encoding='utf-8') as out:
        out.write(m.group(1))
    print("Extracted")
else:
    print("Not found")
