const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5NzI0YWZlZjkxMjczYWUwYjFlMTIzMiIsImNvbGxlY3Rpb24iOiJ1c2VycyIsImVtYWlsIjoiZXR0cm9hZEBiZi5jb20iLCJzaWQiOiIyYWYzZGQ0MS03Y2MyLTRkZGQtOGM5YS1mMDMyYzQyZmY2YjYiLCJpYXQiOjE3Nzc4NzIyOTksImV4cCI6MTc4MDQ2NDI5OX0.Jb6xBt5BOJXHu4UQrCwaQLUroYHBV0sTjT5wMVe8sT4";

async function run() {
  const url = "https://blackforest2.vseyal.com/api/billings?limit=100&depth=0";
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  const data = await res.json();
  for (const bill of data.docs || []) {
    if (bill.totalGSTAmount > 0) {
      console.log("Bill with GST:", JSON.stringify({
        invoiceNumber: bill.invoiceNumber,
        subTotal: bill.subTotal,
        totalTaxableAmount: bill.totalTaxableAmount,
        totalGSTAmount: bill.totalGSTAmount,
        cgstAmount: bill.cgstAmount,
        sgstAmount: bill.sgstAmount,
        totalAmount: bill.totalAmount,
        status: bill.status
      }, null, 2));
      break;
    }
  }
}

run().catch(console.error);
