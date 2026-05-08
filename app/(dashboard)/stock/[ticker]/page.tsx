export default function StockDetailPage({ params }: { params: { ticker: string } }) {
  return <div>Stock Detail: {params.ticker}</div>;
}
