import { datadogLogs } from "@datadog/browser-logs";
import Footer from "common/src/components/Footer";
import { Button } from "common/src/styles";
import { useNavigate } from "react-router-dom";
import bgImage from "../../assets/thank-you.svg";
import Navbar from "../common/Navbar";
import { useAccount } from "wagmi";

export default function ThankYou() {
  datadogLogs.logger.info(
    "====> Route: /round/:chainId/:roundId/:txHash/thankyou"
  );
  datadogLogs.logger.info(`====> URL: ${window.location.href}`);

  const navigate = useNavigate();
  const { address } = useAccount();

  return (
    <>
      <Navbar />
      <div
        className="flex flex-col min-h-screen relative bg-bottom bg-cover bg-no-repeat"
        style={{ backgroundImage: `url(${bgImage})` }}
      >
        <main className="flex-grow">
          <div className="flex flex-col text-center">
            <h1 className="text-5xl mt-28 mb-8 font-sans">
              Thank you for your support!
            </h1>
            <div className="flex flex-col gap-5 items-center justify-center">
              <div className="flex gap-5 items-center justify-center">
                <Button
                  type="button"
                  onClick={() => navigate(`/contributor`)}
                  className="items-center justify-center text-xs text-black rounded-lg border border-solid bg-grey-100 border-grey-100 px-2 hover:shadow-md sm:px-10"
                  data-testid="donation-history-button"
                >
                  Donation History
                </Button>
                <Button
                  type="button"
                  $variant="outline"
                  onClick={() => navigate("/")}
                  className="items-center justify-center text-xs rounded-lg w-[193px] border-1 bg-orange-100 hover:shadow-md px-10"
                  data-testid="home-button"
                >
                  Back home
                </Button>
              </div>
            </div>
          </div>
        </main>
        <div className="fixed -bottom-6 right-11 w-full z-20">
          <Footer />
        </div>
      </div>
    </>
  );
}
