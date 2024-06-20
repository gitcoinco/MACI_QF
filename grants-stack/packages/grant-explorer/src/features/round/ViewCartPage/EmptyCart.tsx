
export function EmptyCart() {
  return (
    <div className="grow block px-[16px] py-4 rounded-lg shadow-lg bg-white border border-violet-400">
      <div className="flex flex-col md:flex-row justify-between border-b-2 pb-2 gap-3">
        <div className="basis-[28%]">
          <h2 className="mt-2 text-xl">Projects</h2>
        </div>
      </div>
      <div className="mt-4">
        <p className="text-grey-500">Cart is empty.</p>
      </div>
    </div>
  );
}
