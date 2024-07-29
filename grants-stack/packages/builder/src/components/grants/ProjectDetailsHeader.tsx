import AcceptOwnershipButton from "../base/acceptOwnershipButton";

export default function ProjectDetailsHeader({
  title,
  bannerImg,
  logoImg,
  profileId,
  showBtn,
}: {
  title: string | undefined;
  bannerImg: string | Blob | undefined;
  logoImg: string | Blob | undefined;
  profileId: string;
  showBtn?: boolean;
}) {
  return (
    <>
      <img
        className="w-full mb-4"
        src={
          bannerImg instanceof Blob ? URL.createObjectURL(bannerImg) : bannerImg
        }
        onError={(e) => {
          e.currentTarget.onerror = null;
          e.currentTarget.src = "./assets/default-project-logo.png";
        }}
        alt="project banner"
      />
      <div className="relative">
        <div className="flex w-full justify-start absolute -top-14 left-8">
          <div className="rounded-full h-20 w-20 bg-quaternary-text border border-tertiary-text flex justify-center items-center">
            <img
              className="rounded-full"
              src={
                logoImg instanceof Blob ? URL.createObjectURL(logoImg) : logoImg
              }
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = "./assets/default-project-logo.png";
              }}
              alt="project logo"
            />
          </div>
        </div>
      </div>
      <h4 className="mb-4 ml-1 mt-14">{title}</h4>
      {showBtn && <AcceptOwnershipButton currentProjectId={profileId ?? ""} />}
    </>
  );
}
