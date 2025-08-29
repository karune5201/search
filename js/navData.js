// js/renderNav.js
import { navData } from './navData.js';

const sidebar = document.getElementById('sidebar');

function makeSection(section) {
  const container = document.createElement('section');
  container.classList.add('nav-section');

  // 标题
  const h2 = document.createElement('h2');
  h2.className = 'nav-title';
  h2.innerHTML = `<i class="iconfont ${section.icon}"></i>${section.title}`;
  container.appendChild(h2);

  // 链接列表
  const ul = document.createElement('ul');
  ul.className = 'nav-list';
  section.links.forEach(link => {
    const li = document.createElement('li');
    li.innerHTML = `
      <a href="${link.href}" target="_blank" rel="nofollow noopener">
        <i class="iconfont ${link.icon}"></i>${link.label}
      </a>`;
    ul.appendChild(li);
  });
  container.appendChild(ul);

  return container;
}

// 清空旧内容（如果有）再渲染
sidebar.innerHTML = '';
navData.forEach(section => {
  sidebar.appendChild(makeSection(section));
});
