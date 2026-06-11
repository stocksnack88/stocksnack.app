export default function StockDetailPage({ params }: { params: { ticker: string } }) {
  return <div style={{ animation: "fadeInUp 400ms ease-out both" }}>Stock Detail: {params.ticker}</div>;
}
