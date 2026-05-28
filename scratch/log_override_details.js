const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5NzI0YWZlZjkxMjczYWUwYjFlMTIzMiIsImNvbGxlY3Rpb24iOiJ1c2VycyIsImVtYWlsIjoiZXR0cm9hZEBiZi5jb20iLCJzaWQiOiIyYWYzZGQ0MS03Y2MyLTRkZGQtOGM5YS1mMDMyYzQyZmY2YjYiLCJpYXQiOjE3Nzc4NzIyOTksImV4cCI6MTc4MDQ2NDI5OX0.Jb6xBt5BOJXHu4UQrCwaQLUroYHBV0sTjT5wMVe8sT4";

async function run() {
  const url = "https://blackforest2.vseyal.com/api/products?limit=100&depth=2";
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  const data = await res.json();
  for (const product of data.docs || []) {
    if (product.name === "Mango Juice") {
      console.log("Mango Juice defaultPriceDetails:", JSON.stringify(product.defaultPriceDetails, null, 2));
      console.log("Mango Juice branchOverrides:", JSON.stringify(product.branchOverrides, null, 2));
    }
  }
}

run().catch(console.error);
