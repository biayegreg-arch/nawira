export default function OfflinePage(): React.JSX.Element {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 py-6 text-center">
      <h1 className="text-xl font-bold text-navy">Tu es hors ligne</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Reconnecte-toi pour continuer à utiliser NAWIRA.
      </p>
    </div>
  );
}
