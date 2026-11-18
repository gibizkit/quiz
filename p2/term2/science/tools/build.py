#!/usr/bin/env python3
"""สร้างเกม วิทยาศาสตร์ ป.2 เทอมปลาย จากคลังคำถามใน questions.py

ใช้เกมสังคม เล่ม 4 ชุด 1 เป็นต้นแบบ (ธีม รูปน้องแมว เสียง เหมือนกันทุกเกม)
แล้วเพิ่มบรรทัด "รู้ไหม" อธิบายคำตอบหลังกดยืนยัน

รันจากโฟลเดอร์รากของโปรเจกต์:
    python3 p2/term2/science/tools/build.py
"""
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
TEMPLATE = os.path.join(ROOT, "p2/term1/social/book4/g2-social-book4-set1.html")
sys.path.insert(0, os.path.dirname(__file__))
from questions import SETS  # noqa: E402


def sub_once(text, old, new):
    n = text.count(old)
    if n != 1:
        raise SystemExit(f"template changed: expected 1 match, found {n}: {old[:60]!r}")
    return text.replace(old, new)


def patch_template(t):
    # CSS สำหรับคำอธิบาย
    t = sub_once(t, ".feedback-msg.bad{ color: var(--color-wrong); }",
                 ".feedback-msg.bad{ color: var(--color-wrong); }\n"
                 ".explain-msg{\n  font-size: 18px; line-height:1.5; text-align:center;\n"
                 "  background:#fff8e1; border:2px dashed #ffd54f; border-radius:16px;\n"
                 "  padding:10px 14px; margin: 4px 0 0;\n}\n"
                 ".explain-msg:empty{ display:none; }\n"
                 ".wrong-item .explain{ color:#8a6d1f; }")
    t = sub_once(t, '<div class="feedback-msg" id="feedbackMsg"></div>',
                 '<div class="feedback-msg" id="feedbackMsg"></div>\n'
                 '    <div class="explain-msg" id="explainMsg"></div>')
    t = sub_once(t, "const btnConfirm = document.getElementById('btnConfirm');",
                 "const btnConfirm = document.getElementById('btnConfirm');\n"
                 "const explainMsgEl = document.getElementById('explainMsg');")
    t = sub_once(t, "  feedbackMsgEl.className = 'feedback-msg';\n",
                 "  feedbackMsgEl.className = 'feedback-msg';\n  explainMsgEl.textContent = '';\n")
    t = sub_once(t, "  progressFillEl.style.width = `${Math.round(((currentIndex + 1)",
                 "  explainMsgEl.textContent = q.explain ? `💡 ${q.explain}` : '';\n\n"
                 "  progressFillEl.style.width = `${Math.round(((currentIndex + 1)")
    t = sub_once(t, "    div.appendChild(correctLine);\n",
                 "    div.appendChild(correctLine);\n\n"
                 "    if (item.question.explain){\n"
                 "      const exLine = document.createElement('div');\n"
                 "      exLine.className = 'explain';\n"
                 "      exLine.textContent = `💡 ${item.question.explain}`;\n"
                 "      div.appendChild(exLine);\n    }\n")
    t = sub_once(t, "0 = เล่นทุกข้อ (ตอนนี้ 57 ข้อ)", "0 = เล่นทุกข้อ")
    return t


def build(base, s):
    qs = []
    for i, (q, choices, answer, explain) in enumerate(s["questions"], 1):
        if answer not in choices:
            raise SystemExit(f"{s['out']} ข้อ {i}: คำตอบไม่อยู่ในตัวเลือก — {q}")
        if len(set(choices)) != len(choices):
            raise SystemExit(f"{s['out']} ข้อ {i}: ตัวเลือกซ้ำ — {q}")
        qs.append({"id": i, "type": "choice", "q": q, "choices": choices,
                   "answer": answer, "explain": explain})
    lines = ",\n".join("    " + json.dumps(x, ensure_ascii=False) for x in qs)
    block = ("<!-- QUESTIONS:START -->\n<script>\nwindow.QUIZ_DATA = {\n"
             f"  title: {json.dumps(s['subtitle'], ensure_ascii=False)},\n"
             f"  questions: [\n{lines}\n  ]\n}};\n</script>\n<!-- QUESTIONS:END -->")

    t = re.sub(r"<!-- QUESTIONS:START -->.*?<!-- QUESTIONS:END -->", lambda m: block, base, flags=re.S)
    t = re.sub(r"<title>.*?</title>", lambda m: f"<title>{s['title']}</title>", t, count=1)
    t = re.sub(r'<p class="subtitle">.*?</p>', lambda m: f'<p class="subtitle">{s["subtitle"]}</p>', t, count=1)

    out = os.path.join(ROOT, s["out"])
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write(t)
    print(f"{s['out']}: {len(qs)} ข้อ")


def main():
    with open(TEMPLATE, encoding="utf-8") as f:
        base = patch_template(f.read())
    for s in SETS:
        build(base, s)


if __name__ == "__main__":
    main()
