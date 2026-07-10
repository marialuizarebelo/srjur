// Avatar de usuária do time (não de cliente): mostra a foto de perfil quando
// existe, senão cai pra bolinha com a inicial + cor — usado em qualquer lugar
// que precise identificar QUEM fez algo (responsável, autor de comentário/
// movimentação, footer da sidebar).
export function UserAvatar({ name, photoUrl, color, className = 'h-6 w-6 text-[9px]' }: {
  name: string | null | undefined
  photoUrl?: string | null
  color?: string | null
  className?: string
}) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name ?? ''}
        title={name ?? ''}
        className={`${className} rounded-full object-cover shrink-0 ring-2 ring-background`}
      />
    )
  }
  return (
    <div
      className={`${className} rounded-full flex items-center justify-center text-white font-bold shrink-0 ring-2 ring-background`}
      style={{ backgroundColor: color ?? '#6B7280' }}
      title={name ?? ''}
    >
      {(name ?? '?').charAt(0).toUpperCase()}
    </div>
  )
}
