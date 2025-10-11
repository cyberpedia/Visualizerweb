import React, { useEffect, useState } from "react";

const PWAInstallPrompt: React.FC = () => {
  const [deferred, setDeferred] = useState<any>(null);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferred(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!deferred) return null;

  return (
    <button
      className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
      onClick={async () => {
        try {
          await deferred.prompt();
          const choice = await deferred.userChoice;
          // hide button after choice
          setDeferred(null);
        } catch {
          setDeferred(null);
        }
      }}
    >
      Install App
    </button>
  );
};

export default PWAInstallPrompt;