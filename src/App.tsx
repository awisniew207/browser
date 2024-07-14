import { addGuardian, recoverAccount, finilizeRecovery } from "./connect";

function App() {
  return (
    <>
      <div className="card">
        <hr />
        <h3>Simple Lit + Candide code</h3>
        <button onClick={async () => await addGuardian()}>Add Guardian</button>
        <button onClick={async () => await recoverAccount()}>
          Start Recovery
        </button>
        <button onClick={async () => await finilizeRecovery()}>
          Finilize Recovery
        </button>
        <h5> Check the browser console! </h5>
        <hr />
      </div>
    </>
  );
}

export default App;
