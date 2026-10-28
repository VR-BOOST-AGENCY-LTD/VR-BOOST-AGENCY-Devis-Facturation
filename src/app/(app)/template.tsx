// Transition de page : remonté à chaque navigation, fondu + léger glissement (désactivé si mouvement réduit).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="anim-page">{children}</div>;
}
