'use client';

import { FC } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'antd';
import GeoMapModal from './GeoMapModal';

interface Tab {
  name: string;
  href: string;
  emoji: string;
}

// const tabs: Tab[] = [
//   { name: 'Data & Features', href: '/data-features', emoji: '📂' },
//   { name: 'Imputation', href: '/imputation', emoji: '🧠' },
//   { name: 'Analysis', href: '/analysis', emoji: '📊' },
// ];

const tabs: Tab[] = [
  { name: 'Data & Features', href: '/data-features', emoji: '📂' }
];

const Navbar: FC = () => {
  const pathname = usePathname();

  const menuItems = tabs.map(tab => ({
    key: tab.href,
    label: <Link href={tab.href}>{`${tab.emoji} ${tab.name}`}</Link>,
  }));

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
      <GeoMapModal />
    </div>
  );
};

export default Navbar;
