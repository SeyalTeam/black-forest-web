"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { readBranchSession } from "@/components/branch-session";
import {
  BackIcon,
  BagIcon,
  BellIcon,
  CartIcon,
  NoteAddIcon,
  NoteSavedIcon,
  PinIcon,
  VegIcon,
} from "@/components/menu-icons";
import { useOrder } from "@/components/order-provider";
import styles from "./kot-shell.module.css";

export default function KotPage() {
  const router = useRouter();
  const {
    cartItems,
    totalItems,
    clearCart,
    addItem,
    decreaseItem,
    cookingRequests,
    updateCookingRequest,
  } = useOrder();
  const [editingRequestItemId, setEditingRequestItemId] = useState<string | null>(null);
  const [requestDraft, setRequestDraft] = useState("");
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [branchId, setBranchId] = useState("");
  const [branchName, setBranchName] = useState("VSeyal");
  const [sharedTableNumber, setSharedTableNumber] = useState("");
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [orderMessage, setOrderMessage] = useState("");
  const [orderError, setOrderError] = useState("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const session = readBranchSession();
      if (!session?.branchId) {
        setHasAccess(false);
        return;
      }

      setHasAccess(true);
      setBranchId(session.branchId);
      setBranchName(session.branchName || "VSeyal");
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  const summaryLabel = totalItems === 1 ? "1 item" : `${totalItems} items`;
  const activeEditingRequestItemId =
    editingRequestItemId && cartItems.some((item) => item.id === editingRequestItemId)
      ? editingRequestItemId
      : null;
  const closeRequestEditor = () => {
    setEditingRequestItemId(null);
    setRequestDraft("");
  };
  const returnToMenu = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/");
  };
  const saveRequestEditor = () => {
    if (!activeEditingRequestItemId) {
      return;
    }

    updateCookingRequest(activeEditingRequestItemId, requestDraft);
    closeRequestEditor();
  };
  const submitOrder = async () => {
    const trimmedTableNumber = sharedTableNumber.trim();
    if (!branchId) {
      setOrderError("Branch is not ready yet. Open the homepage again.");
      setOrderMessage("");
      return;
    }
    if (!trimmedTableNumber) {
      setOrderError("Enter a table number before placing the order.");
      setOrderMessage("");
      return;
    }
    if (cartItems.length === 0) {
      setOrderError("Add at least one item before placing the order.");
      setOrderMessage("");
      return;
    }

    setIsSubmittingOrder(true);
    setOrderError("");
    setOrderMessage("");

    try {
      const response = await fetch("/api/place-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          branchId,
          branchName,
          tableNumber: trimmedTableNumber,
          items: cartItems.map((item) => ({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            note: cookingRequests[item.id] ?? "",
          })),
        }),
      });

      const payload = (await response.json()) as {
        message?: string;
        invoiceNumber?: string;
        billId?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message || "Unable to place the order.");
      }

      clearCart();
      setSharedTableNumber("");
      if (payload.billId) {
        router.push(`/bill/${encodeURIComponent(payload.billId)}`);
        return;
      }

      setOrderMessage(
        payload.invoiceNumber
          ? `Order placed successfully. Invoice ${payload.invoiceNumber}.`
          : `Order placed successfully for table ${trimmedTableNumber}.`,
      );
    } catch (error) {
      setOrderError(
        error instanceof Error ? error.message : "Unable to place the order.",
      );
    } finally {
      setIsSubmittingOrder(false);
    }
  };

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
        <header className={styles.header}>
          <button
            type="button"
            className={styles.headerBackButton}
            aria-label="Back to menu"
            onClick={returnToMenu}
          >
            <BackIcon className={styles.headerBackIcon} />
          </button>

          <h1 className={styles.headerTitle}>{branchName}</h1>

          <div className={styles.headerActions}>
            <button type="button" className={styles.headerIconButton} aria-label="Notifications">
              <BellIcon className={styles.headerIcon} />
            </button>
            <button type="button" className={styles.headerIconButton} aria-label="Cart">
              <CartIcon className={styles.headerIcon} />
              {totalItems > 0 ? <span className={styles.headerBadge}>{totalItems}</span> : null}
            </button>
          </div>
        </header>

        <div className={styles.chipRow}>
          <div className={styles.chip}>
            <PinIcon className={styles.chipIconSvg} />
            Shared Tables
          </div>
          <div className={styles.chip}>
            <BagIcon className={styles.chipIconSvg} />
            {summaryLabel}
          </div>
        </div>

        <section className={styles.orderCard}>
          <div className={styles.titleRow}>
            <h2>Current Order</h2>
            <div className={styles.titleLine} />
          </div>

          <div className={styles.itemList}>
            {cartItems.length > 0 ? (
              cartItems.map((item, index) => {
                const itemNote = cookingRequests[item.id]?.trim() ?? "";
                const hasSavedNote = itemNote.length > 0;

                return (
                  <div key={item.id} className={styles.itemGroup}>
                    <article className={styles.itemRow}>
                      <div className={styles.itemLead}>
                        <VegIcon isVeg={item.isVeg} />
                        <div className={styles.itemMeta}>
                          <h3>{item.name}</h3>
                          {hasSavedNote ? (
                            <div className={styles.itemSavedNote}>{itemNote}</div>
                          ) : index === 0 ? (
                            <div className={styles.itemHintText}>
                              Tap
                              <NoteAddIcon className={styles.itemHintInlineIcon} />
                              Icon to add a cooking note
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <button
                        type="button"
                        className={styles.noteButton}
                        onClick={() => {
                          setEditingRequestItemId(item.id);
                          setRequestDraft(cookingRequests[item.id] ?? "");
                        }}
                        aria-label="Cooking requests"
                      >
                        {hasSavedNote ? (
                          <NoteSavedIcon
                            className={`${styles.noteIcon} ${styles.noteSavedIcon}`}
                          />
                        ) : (
                          <NoteAddIcon className={styles.noteIcon} />
                        )}
                      </button>

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
                  </div>
                );
              })
            ) : (
              <div className={styles.emptyState}>No items added yet.</div>
            )}
          </div>

          <button type="button" className={styles.addMoreButton} onClick={returnToMenu}>
            <span>＋</span>
            Add More Items
          </button>
        </section>
      </section>

      <div className={styles.footerDock}>
        <div className={styles.footerInner}>
          <input
            value={sharedTableNumber}
            onChange={(event) => {
              setSharedTableNumber(event.target.value);
              if (orderError) setOrderError("");
              if (orderMessage) setOrderMessage("");
            }}
            className={styles.sharedTableInput}
            placeholder="Enter table number"
          />
          <button
            type="button"
            className={styles.orderButton}
            onClick={submitOrder}
            disabled={isSubmittingOrder}
          >
            {isSubmittingOrder ? "PLACING..." : "ORDER"}
          </button>
          {orderError ? <div className={styles.orderFeedbackError}>{orderError}</div> : null}
          {orderMessage ? <div className={styles.orderFeedbackSuccess}>{orderMessage}</div> : null}
        </div>
      </div>

      {activeEditingRequestItemId ? (
        <div className={styles.modalBackdrop} onClick={closeRequestEditor}>
          <div
            className={styles.noteModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="special-note-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="special-note-title" className={styles.noteModalTitle}>
              Special Note
            </h2>
            <textarea
              value={requestDraft}
              onChange={(event) => setRequestDraft(event.target.value)}
              className={styles.noteModalInput}
              placeholder="Enter instructions..."
              autoFocus
            />
            <div className={styles.noteModalActions}>
              <button
                type="button"
                className={styles.noteModalButton}
                onClick={closeRequestEditor}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.noteModalButton} ${styles.noteModalButtonPrimary}`}
                onClick={saveRequestEditor}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
