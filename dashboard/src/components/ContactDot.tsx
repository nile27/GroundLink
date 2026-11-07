interface Props {
  contact: boolean;
}

/** 교신 점: 교신 중 초록, 아니면(텔레메트리 없음 포함) 회색 */
export function ContactDot({ contact }: Props) {
  return (
    <span
      data-contact={contact}
      title={contact ? '교신 중' : '교신 없음'}
      className="inline-block size-2.5 rounded-full bg-muted data-[contact=true]:bg-contact"
    />
  );
}
