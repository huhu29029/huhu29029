type WordCountBadgeProps = {
  count: number;
};

export function WordCountBadge({ count }: WordCountBadgeProps) {
  return <span className="word-count">{count} 字</span>;
}
