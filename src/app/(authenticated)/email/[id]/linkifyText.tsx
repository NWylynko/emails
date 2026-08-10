export function linkifyText(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+?)(?=[.,\])}]?\s|$)/g;
  return text.split(urlRegex).map((part, index) => urlRegex.test(part) ? (
    <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
      {part}
    </a>
  ) : (
    part
  )
  );
}