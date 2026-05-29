#!/usr/bin/env bash
# precommit-secret-scan.sh
# 轻量提交前扫描：阻止真实微信账单 / 个人敏感信息被误提交。
#
# 安装（任选其一）：
#   1) 直接软链为 git 钩子：
#        ln -sf ../../scripts/precommit-secret-scan.sh .git/hooks/pre-commit
#   2) 使用项目内钩子目录：
#        git config core.hooksPath scripts/githooks
#        然后把本脚本拷贝/软链到 scripts/githooks/pre-commit
#
# 退出码非 0 时将中止本次提交。设置 SKIP_BILL_SCAN=1 可临时跳过（不建议）。

set -u
[ "${SKIP_BILL_SCAN:-0}" = "1" ] && exit 0

red() { printf '\033[31m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

# 仅检查“已暂存”的新增/修改内容
staged=$(git diff --cached --name-only --diff-filter=ACM)
[ -z "$staged" ] && exit 0

violations=0

# 1) 账单类文件：根目录或 sample/ 之外的 xlsx/xls/csv 一律拦截
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    sample/*) continue ;;
  esac
  case "$f" in
    *.xlsx|*.xls|*.csv|*.XLSX|*.XLS|*.CSV)
      red "✗ 疑似账单/表格文件被加入提交：$f"
      yellow "  账单文件不应入库。如确为脱敏样例，请放入 sample/ 目录。"
      violations=$((violations+1))
      ;;
  esac
done <<< "$staged"

# 2) 内容特征：微信账单/个人身份字段（仅扫描文本类暂存内容）
#    命中典型账单表头或个人信息正则即拦截。
patterns='微信昵称：\[|微信支付账单明细|交易单号.*商户单号|起始时间：\[.*终止时间：\[|身份证号|\b[1-9][0-9]{5}(19|20)[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[0-9]{3}[0-9Xx]\b|\b1[3-9][0-9]{9}\b'
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    sample/*) continue ;;
    scripts/precommit-secret-scan.sh) continue ;;  # 本脚本自身含示例正则，跳过
  esac
  # 跳过二进制文件
  if git diff --cached --numstat -- "$f" | grep -q '^-' ; then continue; fi
  added=$(git diff --cached -U0 -- "$f" | grep '^+' | grep -v '^+++')
  if printf '%s' "$added" | grep -nEq "$patterns"; then
    red "✗ 在 $f 中检测到疑似个人敏感信息（账单表头/手机号/身份证号等）。"
    violations=$((violations+1))
  fi
done <<< "$staged"

if [ "$violations" -gt 0 ]; then
  red "提交被拦截：发现 $violations 处疑似敏感内容。"
  yellow "确认无误后可用  SKIP_BILL_SCAN=1 git commit ...  临时跳过（请谨慎）。"
  exit 1
fi
exit 0
