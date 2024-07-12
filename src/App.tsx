import { work } from "./connect";

function App() {

  return (
    <>
      <div className="card">
      <hr />
        <h3>Simple Lit + Candide code</h3>
        <button onClick={async () => await work()}>
        Run
        </button>
        <h5> Check the browser console! </h5>
        <hr />
      </div>
    </>
  );
}

export default App;
