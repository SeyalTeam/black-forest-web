const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5NzI0YWZlZjkxMjczYWUwYjFlMTIzMiIsImNvbGxlY3Rpb24iOiJ1c2VycyIsImVtYWlsIjoiZXR0cm9hZEBiZi5jb20iLCJzaWQiOiIyYWYzZGQ0MS03Y2MyLTRkZGQtOGM5YS1mMDMyYzQyZmY2YjYiLCJpYXQiOjE3Nzc4NzIyOTksImV4cCI6MTc4MDQ2NDI5OX0.Jb6xBt5BOJXHu4UQrCwaQLUroYHBV0sTjT5wMVe8sT4";

async function run() {
  const url = "https://blackforest2.vseyal.com/api/products?limit=100&depth=2";
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  const data = await res.json();
  let hasOverrideGst = false;
  for (const product of data.docs || []) {
    const defaultGst = product.defaultPriceDetails?.gst;
    if (product.branchOverrides && product.branchOverrides.length > 0) {
      for (const override of product.branchOverrides) {
        if (override.gst || override.defaultPriceDetails?.gst) {
          console.log("Found override GST! Product:", product.name, "Override GST:", override.gst || override.defaultPriceDetails?.gst);
          hasOverrideGst = true;
        }
      }
    }
  }
  if (!hasOverrideGst) {
    console.log("No override GST found in first 100 products.");
  }
}

run().catch(console.error);
