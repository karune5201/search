#!/bin/sh
# Git 多功能管理脚本（适合任意 Git 项目）
# 作者：ChatGPT 改写 - 自由使用但请保留出处

# 颜色定义
GREEN="\033[1;32m"
YELLOW="\033[1;33m"
RED="\033[1;31m"
RESET="\033[0m"

# 获取脚本路径并进入
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
cd "$SCRIPT_DIR" || exit 1

# 欢迎界面
clear
echo "==============================================="
echo "         欢迎使用 Git 项目管理脚本！"
echo "==============================================="
echo -e "${GREEN}当前目录：${SCRIPT_DIR}${RESET}"
echo ""

# 显示菜单
while true; do
echo "请选择功能："
echo "  [1] 从 GitHub 拉取最新版本"
echo "  [2] 提交修改到 GitHub"
echo "  [3] 克隆新的 Git 仓库"
echo "  [4] 查看当前 Git 状态"
echo "  [5] 查看 Git 提交日志"
echo "  [6] 创建并切换新分支"
echo "  [7] 查看并切换已有分支"
echo "  [8] 撤销所有未提交修改（危险操作）"
echo "  [9] 删除 .git 并初始化新仓库"
echo "  [0] 退出脚本"
echo ""

# 用户输入
printf "${YELLOW}请输入操作编号 [0-9]: ${RESET}"
read -r choice

case "$choice" in
  1)
    echo -e "${GREEN}>> 正在从 GitHub 拉取最新版本...${RESET}"
    git pull origin master || git pull origin main
    echo -e "${GREEN}>> 拉取完成。${RESET}"
    ;;
  2)
    echo -e "${GREEN}>> 提交中...${RESET}"
    git add .
    git commit -m "Update by script"
    git push -f origin master || git push -f origin main
    echo -e "${GREEN}>> 提交完成。${RESET}"
    ;;
  3)
    printf "${YELLOW}请输入 Git 仓库地址：https://github.com/xxx/xxx.git：${RESET}"
    read -r repo_url
    git clone "$repo_url"
    ;;
  4)
    echo -e "${GREEN}>> 当前 Git 状态：${RESET}"
    git status
    ;;
  5)
    echo -e "${GREEN}>> 最近提交记录：${RESET}"
    git log --oneline --graph --decorate -n 10
    ;;
  6)
    printf "${YELLOW}请输入新分支名称：${RESET}"
    read -r new_branch
    git checkout -b "$new_branch"
    ;;
  7)
    echo -e "${GREEN}>> 本地分支列表：${RESET}"
    git branch
    printf "${YELLOW}请输入要切换的分支名称：${RESET}"
    read -r branch
    git checkout "$branch"
    ;;
  8)
    echo -e "${RED}警告：将撤销所有未提交修改。继续？(y/n)：${RESET}"
    read -r confirm
    [ "$confirm" = "y" ] && git reset --hard HEAD && echo -e "${GREEN}>> 已恢复到最后一次提交。${RESET}" || echo ">> 已取消操作。"
    ;;
  9)
    echo -e "${RED}危险操作：删除 .git 并初始化新仓库。继续？(y/n)：${RESET}"
    read -r confirm
    if [ "$confirm" = "y" ]; then
      rm -rf .git && git init
      echo -e "${GREEN}>> 已初始化为新仓库。${RESET}"
    else
      echo ">> 已取消操作。"
    fi
    ;;
  0)
    echo -e "${GREEN}感谢使用，再见！${RESET}"
    exit 0
    ;;
  *)
    echo -e "${RED}无效选项，请输入 0-9 之间的数字。${RESET}"
    ;;
esac

echo ""  # 空行分隔
done
