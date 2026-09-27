// 使用标准 atob 解码（Node 16+/Deno/Bun/Workers 通用），避免额外依赖
export const WELCOME = "  == https://github.com/vecmat == " + "\n\n     🌑 🌒 🌓 🌔 🌕 🌖 🌗 🌘 🌑    \n\n";
const LOGOSTR =
    "CiBfICAgIF8gICAgICBfICAgICAgI" +
    "CAgICAgXyBfICAgIF8gCnwgfCAgKF" +
    "8pICAgIChfKSAgICAgICAgICAoXyk" +
    "gfCAgKF8pCnwgfCBfX18gXyBfXyBf" +
    "IF8gX18gIF8gX18gX3wgfCBfX18gC" +
    "nwgfC8gLyB8ICdfX3wgfCAnXyBcfC" +
    "AnX198IHwgfC8gLyB8CnwgICA8fCB" +
    "8IHwgIHwgfCB8IHwgfCB8ICB8IHwg" +
    "ICA8fCB8CnxffFxfXF98X3wgIHxff" +
    "F98IHxffF98ICB8X3xffFxfXF98Cg==";

export const LOGO = atob(LOGOSTR);
