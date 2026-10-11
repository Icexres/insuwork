# Edit packages/shared/i18n/en.json without reformatting it: insert keys at the start of an object, or replace a
# leaf string/array. Usage: python scripts/i18n-edit.py ops.json   (ops: [{op: insert|set, path: [...], add|value}])
import json, re, sys

P = "packages/shared/i18n/en.json"
LEAF = re.compile(r'(\[[^\]]*\]|"(?:[^"\\]|\\.)*")')


def find_obj(raw, path):
    pos, ind = 0, ""
    for k in path:
        m = re.compile(r'\n(\s*)"' + re.escape(k) + r'": \{\n').search(raw, pos)
        if not m:
            raise SystemExit(f"key not found: {'.'.join(path)}")
        pos, ind = m.end(), m.group(1) + "  "
    return pos, ind


def insert(raw, path, additions):
    pos, ind = find_obj(raw, path)
    blk = json.dumps(additions, indent=2, ensure_ascii=False)[1:-1].strip("\n")
    return raw[:pos] + "\n".join(ind + l[2:] for l in blk.split("\n")) + ",\n" + raw[pos:]


def set_value(raw, path, value):
    pos, _ = find_obj(raw, path[:-1])
    key = re.compile('"' + re.escape(path[-1]) + '": ').search(raw, pos)
    m = LEAF.match(raw, key.end())
    return raw[: key.start()] + f'"{path[-1]}": ' + json.dumps(value, ensure_ascii=False) + raw[m.end():]


raw = open(P, encoding="utf8").read()
for op in json.load(open(sys.argv[1], encoding="utf8")):
    raw = insert(raw, op["path"], op["add"]) if op["op"] == "insert" else set_value(raw, op["path"], op["value"])
json.loads(raw)
open(P, "w", encoding="utf8", newline="").write(raw)
print("ok")
