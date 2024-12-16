import { useState } from 'react';
import { connectToLit } from "../connect";

export const LitConnector = () => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      setError(null);
      await connectToLit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="lit-connector">
      <h3>Simple LitNodeClient Connection</h3>
      <button 
        onClick={handleConnect}
        disabled={isConnecting}
      >
        {isConnecting ? 'Connecting...' : 'Connect'}
      </button>
      {error && <p className="error">{error}</p>}
      <h5>Check the browser console!</h5>
    </div>
  );
}; 