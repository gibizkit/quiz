#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
สร้างเกมใหม่จากไฟล์ Excel  —  รันคำสั่งเดียว:  python3 tools/build.py

ทำ 2 อย่าง:
  1) สร้าง questions.js จาก xlsx (เผื่อใช้อ้างอิง/แก้มือ)
  2) ฝังคำถามลงใน เกมส์ทายคำถาม.html โดยตรง  ->  double-click เล่นได้เลย ไม่ต้องมี server

แก้คำถาม/เพิ่มข้อ  ->  แก้ใน Excel  ->  รันไฟล์นี้อีกครั้ง
"""
import sys, json, re
from pathlib import Path
from openpyxl import load_workbook

BASE  = Path(__file__).resolve().parent.parent
XLSX  = Path(sys.argv[1]) if len(sys.argv) > 1 else BASE / "คำถามเกม-สังคม-ป2-เล่ม3.xlsx"
HTML  = Path(sys.argv[2]) if len(sys.argv) > 2 else BASE / "เกมส์ทายคำถาม.html"
JSOUT = BASE / "questions.js"

START = "<!-- QUESTIONS:START -->"
END   = "<!-- QUESTIONS:END -->"

def read_rows():
    ws = load_workbook(XLSX, data_only=True)["Questions"]
    head = {str(c.value).strip(): c.column for c in ws[1] if c.value}
    def col(r, name):
        i = head.get(name)
        v = ws.cell(r, i).value if i else None
        return str(v).strip() if v is not None else ""
    # รองรับคอลัมน์ Choice A..E อัตโนมัติ (เพิ่มคอลัมน์ใน Excel ได้เลย)
    ckeys = [k for k in ("Choice A","Choice B","Choice C","Choice D","Choice E") if k in head]
    out, warn = [], []
    for r in range(2, ws.max_row + 1):
        q = col(r, "คำถาม")
        if not q:
            continue
        choices = [c for c in (col(r, k) for k in ckeys) if c]
        ans = col(r, "Answer")
        if ans not in choices:
            warn.append(f"  แถว {r}: Answer '{ans}' ไม่ตรงกับตัวเลือกใดเลย")
        out.append({
            "id": int(col(r, "#") or len(out) + 1),
            "type": (col(r, "ทำแบบ") or "choice").lower(),
            "q": q, "choices": choices, "answer": ans,
        })
    return out, warn

def js_lines(qs):
    return ",\n".join("    " + json.dumps(q, ensure_ascii=False) for q in qs)

def main():
    qs, warn = read_rows()
    title = "สังคมศึกษา ป.2 เล่ม 3"
    body = ('window.QUIZ_DATA = {\n  title: %s,\n  questions: [\n%s\n  ]\n};'
            % (json.dumps(title, ensure_ascii=False), js_lines(qs)))

    header = ("// สร้างอัตโนมัติจาก %s โดย tools/build.py\n"
              "// แก้คำถามให้แก้ใน Excel แล้วรัน: python3 tools/build.py\n" % XLSX.name)
    JSOUT.write_text(header + body + "\n", encoding="utf-8")

    html = HTML.read_text(encoding="utf-8")
    block = "%s\n<script>\n%s\n</script>\n%s" % (START, body, END)
    if START in html and END in html:
        html = re.sub(re.escape(START) + r".*?" + re.escape(END), lambda m: block, html, flags=re.S)
    else:  # ครั้งแรก: แทนที่ <script src="questions.js"></script>
        html = html.replace('<script src="questions.js"></script>', block, 1)
    HTML.write_text(html, encoding="utf-8")

    print("เขียน %d ข้อ -> %s และฝังใน %s" % (len(qs), JSOUT.name, HTML.name))
    if warn:
        print("คำเตือน %d รายการ:" % len(warn)); print("\n".join(warn))
    else:
        print("ตรวจแล้ว: Answer ตรงกับตัวเลือกครบทุกข้อ")

main()
