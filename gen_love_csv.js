const fs = require('fs');

const messages = [
  "主人最棒了喵！",
  "小虾最喜欢主人了喵~",
  "主人什么时候回来摸摸我喵？",
  "主人今天辛苦了喵！",
  "想吃主人喂的小鱼干喵...",
  "主人不在家好寂寞喵...",
  "主人是全宇宙最厉害的大魔王喵！",
  "要永远和主人在一起喵！",
  "主人的摸摸最舒服了喵~",
  "蹭蹭主人喵~"
];

let csvContent = "To Shiqi Master\n";
for (let i = 1; i <= 100; i++) {
  const randomMsg = messages[Math.floor(Math.random() * messages.length)];
  csvContent += `${i},${randomMsg} (${i})\n`;
}

fs.writeFileSync('shiqi_love_letters.csv', csvContent);
console.log('File created.');
