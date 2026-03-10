"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { productAvatarLabel, useOrder } from "@/components/order-provider";
import styles from "./page.module.css";

const SESSION_BRANCH_ID_KEY = "blackforest-order-web-branch-id";

function VegIcon({ isVeg }: { isVeg: boolean }) {
  return (
    <span
      className={isVeg ? styles.vegIcon : styles.nonVegIcon}
      aria-hidden="true"
    >
      <span />
    </span>
  );
}

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
  const [hasAccess] = useState<boolean | null>(() => {
    if (typeof window === "undefined") return null;
    return Boolean(window.sessionStorage.getItem(SESSION_BRANCH_ID_KEY)?.trim());
  });

  const summaryLabel = totalItems === 1 ? "1 item added" : `${totalItems} items added`;
  const previewItems = useMemo(
    () => cartItems.slice(Math.max(0, cartItems.length - 2)),
    [cartItems],
  );

  if (hasAccess === false) {
    return (
      <main className={styles.page}>
        <section className={styles.shell}>
          <header className={styles.header}>
            <div>
              <p className={styles.eyebrow}>Table order</p>
              <h1 className={styles.title}>Access blocked</h1>
            </div>
            <Link href="/" className={styles.backLink}>
              Back to menu
            </Link>
          </header>

          <section className={styles.orderCard}>
            <div className={styles.cardHeader}>
              <h2>Location verification required</h2>
            </div>
            <p>
              This page opens only after the homepage verifies your location against Branch Geo
              Settings radius.
            </p>
          </section>
        </section>
      </main>
    );
  }

  if (hasAccess === null) {
    return (
      <main className={styles.page}>
        <section className={styles.shell}>
          <section className={styles.orderCard}>
            <div className={styles.cardHeader}>
              <h2>Checking access...</h2>
            </div>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Table order</p>
            <h1 className={styles.title}>Current KOT</h1>
          </div>
          <Link href="/" className={styles.backLink}>
            Back to menu
          </Link>
        </header>

        <div className={styles.infoRow}>
          <div className={styles.infoChip}>Shared Tables</div>
          <div className={styles.infoChip}>{summaryLabel}</div>
        </div>

        <section className={styles.orderCard}>
          <div className={styles.cardHeader}>
            <h2>Current Order</h2>
            <span>{cartItems.length} products</span>
          </div>

          <div className={styles.itemList}>
            {cartItems.map((item) => (
              <article key={item.id} className={styles.itemRow}>
                <div className={styles.itemLead}>
                  <div className={styles.itemIconWrap}>
                    <VegIcon isVeg={item.isVeg} />
                  </div>
                  <div className={styles.itemMeta}>
                    <h3>{item.name}</h3>
                    <p>{item.description}</p>
                    {cookingRequest ? <small>Request saved for kitchen</small> : null}
                  </div>
                </div>

                <div className={styles.itemActions}>
                  <div className={styles.qtyBox}>
                    <button type="button" onClick={() => decreaseItem(item.id)}>
                      −
                    </button>
                    <span>{item.quantity}</span>
                    <button type="button" onClick={() => addItem(item)}>
                      +
                    </button>
                  </div>
                  <strong>₹{item.price * item.quantity}</strong>
                </div>
              </article>
            ))}
          </div>

          <div className={styles.inlineActions}>
            <Link href="/" className={styles.secondaryAction}>
              <span>+</span>
              Add Items
            </Link>
            <button
              type="button"
              className={styles.secondaryAction}
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
                style={{ background: item.accent, left: `${index * 24}px` }}
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
