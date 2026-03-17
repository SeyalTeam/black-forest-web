"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CartIcon, HomeNavIcon, MenuNavIcon } from "@/components/menu-icons";
import { useOrder } from "@/components/order-provider";
import styles from "./bottom-nav.module.css";

function getActiveKey(pathname: string) {
  if (pathname === "/") {
    return "home";
  }

  if (pathname === "/categories" || pathname.startsWith("/products/")) {
    return "menu";
  }

  if (pathname === "/kot" || pathname.startsWith("/bill/")) {
    return "cart";
  }

  return "";
}

export function BottomNav() {
  const pathname = usePathname();
  const { totalItems } = useOrder();
  const activeKey = getActiveKey(pathname);

  const items = [
    { key: "home", href: "/", label: "Home", Icon: HomeNavIcon },
    { key: "menu", href: "/categories", label: "Menu", Icon: MenuNavIcon },
    { key: "cart", href: "/kot", label: "Cart", Icon: CartIcon },
  ] as const;

  return (
    <nav className={styles.bottomNavShell} aria-label="Bottom navigation">
      <div className={styles.bottomNavInner}>
        {items.map(({ key, href, label, Icon }) => {
          const isActive = activeKey === key;
          return (
            <Link
              key={key}
              href={href}
              className={isActive ? styles.bottomNavItemActive : styles.bottomNavItem}
            >
              <Icon className={styles.bottomNavIcon} />
              <span className={styles.bottomNavLabel}>{label}</span>
              {key === "cart" && totalItems > 0 ? (
                <span className={styles.bottomNavBadge}>{totalItems}</span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
