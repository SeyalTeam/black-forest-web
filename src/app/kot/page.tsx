"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { readBranchSession } from "@/components/branch-session";
import { ProfileIcon, VegIcon } from "@/components/menu-icons";
import { productAvatarLabel, useOrder } from "@/components/order-provider";
import styles from "./kot-shell.module.css";

export default function KotPage() {
  const {
    cartItems,
    totalItems,
    totalAmount,
    addItem,
    decreaseItem,
    cookingRequest,
    updateCookingRequest,
  } = useOrder();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [branchName, setBranchName] = useState("VSeyal");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const session = readBranchSession();
      if (!session?.branchId) {
        setHasAccess(false);
        return;
      }

      setHasAccess(true);
      setBranchName(session.branchName || "VSeyal");
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  const summaryLabel = totalItems === 1 ? "1 item added" : `${totalItems} items added`;
  const previewItems = useMemo(
    () => cartItems.slice(Math.max(0, cartItems.length - 2)),
    [cartItems],
  );

  if (hasAccess === false) {
    return (
      <main className={styles.page}>
        <section className={styles.shell}>
          <div className={styles.statusCard}>
            <strong>Access blocked</strong>
            Open the homepage first and complete branch location verification.
          </div>
        </section>
      </main>
    );
  }

  if (hasAccess === null) {
    return (
      <main className={styles.page}>
        <section className={styles.shell}>
          <div className={styles.statusCard}>Checking access...</div>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.topBar}>
          <div className={styles.branchWrap}>
            <div className={styles.avatar}>
              <ProfileIcon className={styles.profileIcon} />
            </div>
            <div>
              <div className={styles.branchMeta}>TABLE ORDER</div>
              <h1 className={styles.branchName}>{branchName}</h1>
            </div>
          </div>
          <Link href="/" className={styles.backLink}>
            Back to menu
          </Link>
        </header>

        <div className={styles.chipRow}>
          <div className={styles.chip}>
            <span className={styles.chipIcon}>⌂</span>
            Shared Tables
          </div>
          <div className={styles.chip}>
            <span className={styles.chipIcon}>👜</span>
            {summaryLabel}
          </div>
        </div>

        <section className={styles.orderCard}>
          <div className={styles.titleRow}>
            <h2>Current Order</h2>
            <div className={styles.titleLine} />
          </div>

          <div className={styles.itemList}>
            {cartItems.map((item) => (
              <article key={item.id} className={styles.itemRow}>
                <div className={styles.itemLead}>
                  <VegIcon isVeg={item.isVeg} />
                  <div className={styles.itemMeta}>
                    <h3>{item.name}</h3>
                    <p>{item.description}</p>
                  </div>
                </div>

                <div className={styles.itemActions}>
                  <div className={styles.qtyBox}>
                    <button type="button" onClick={() => decreaseItem(item.id)}>
                      −
                    </button>
                    <span className={styles.qtyValue}>{item.quantity}</span>
                    <button type="button" onClick={() => addItem(item)}>
                      +
                    </button>
                  </div>
                  <div className={styles.itemPrice}>₹{item.price * item.quantity}</div>
                </div>
              </article>
            ))}
          </div>

          <div className={styles.inlineActions}>
            <Link href="/" className={styles.inlineAction}>
              <span>＋</span>
              Add Items
            </Link>
            <button
              type="button"
              className={styles.inlineAction}
              onClick={() => setIsEditorOpen((current) => !current)}
            >
              <span>✎</span>
              Cooking requests
            </button>
          </div>

          {isEditorOpen ? (
            <div className={styles.requestPanel}>
              <label htmlFor="cooking-request">Cooking request</label>
              <textarea
                id="cooking-request"
                value={cookingRequest}
                onChange={(event) => updateCookingRequest(event.target.value)}
                placeholder="Example: less spicy, cut into 4 pieces, no onion."
              />
            </div>
          ) : null}
        </section>

        <label className={styles.tableInput}>
          <span>Shared table number</span>
          <input defaultValue="T12" placeholder="Enter shared table number" />
        </label>
      </section>

      <div className={styles.orderBar}>
        <div className={styles.orderPreview}>
          <div className={styles.previewStack}>
            {previewItems.map((item, index) => (
              <div
                key={item.id}
                className={styles.previewAvatar}
                style={{ background: item.accent, left: `${index * 20}px` }}
              >
                {productAvatarLabel(item.name)}
              </div>
            ))}
          </div>
          <div>
            <strong>{summaryLabel}</strong>
            <p>₹{totalAmount} ready to send</p>
          </div>
        </div>
        <button type="button" className={styles.orderButton}>
          Order here
        </button>
      </div>
    </main>
  );
}
