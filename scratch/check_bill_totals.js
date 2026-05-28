const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5NzI0YWZlZjkxMjczYWUwYjFlMTIzMiIsImNvbGxlY3Rpb24iOiJ1c2VycyIsImVtYWlsIjoiZXR0cm9hZEBiZi5jb20iLCJzaWQiOiIyYWYzZGQ0MS03Y2MyLTRkZGQtOGM5YS1mMDMyYzQyZmY2YjYiLCJpYXQiOjE3Nzc4NzIyOTksImV4cCI6MTc4MDQ2NDI5OX0.Jb6xBt5BOJXHu4UQrCwaQLUroYHBV0sTjT5wMVe8sT4";

async function run() {
  const url = "https://blackforest2.vseyal.com/api/billings?limit=5&depth=0";
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  const data = await res.json();
  if (data.docs && data.docs.length > 0) {
    const firstBill = data.docs[0];
    console.log("Full bill data keys:", Object.keys(firstBill));
    console.log("Full bill sample:", JSON.stringify({
      totalAmount: firstBill.totalAmount,
      finalAmount: firstBill.finalAmount,
      subtotal: firstBill.subtotal,
      gstAmount: firstBill.gstAmount,
      discountAmount: firstBill.discountAmount,
      status: firstBill.status
    }, null, 2));
  }
}

run().catch(console.error);
