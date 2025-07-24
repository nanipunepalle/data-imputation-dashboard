'use client';

import { FC } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'antd';

interface Tab {
  name: string;
  href: string;
  emoji: string;
}

const tabs: Tab[] = [
  { name: 'Data & Features', href: '/data-features', emoji: '📂' },
  { name: 'Imputation', href: '/imputation', emoji: '🧠' },
  { name: 'Analysis', href: '/analysis', emoji: '📊' },
];

const Navbar: FC = () => {
  const pathname = usePathname();

  const menuItems = tabs.map(tab => ({
    key: tab.href,
    label: <Link href={tab.href}>{`${tab.emoji} ${tab.name}`}</Link>,
  }));

  return (
    <Menu
      mode="horizontal"
      selectedKeys={[pathname]}
      items={menuItems}
      style={{
        borderBottom: '1px solid #f0f0f0',
        maxHeight: '40px',
        overflow: 'hidden'
      }}
    />
  );
};

export default Navbar;
