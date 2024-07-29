import { useAllo } from "common";
import { useEffect, useState } from "react";
import { shallowEqual, useDispatch, useSelector } from "react-redux";
import { acceptOwnership } from "../../actions/acceptOwnership";
import { RootState } from "../../reducers";
import { Status } from "../../reducers/acceptOwnership";
import Button, { ButtonVariants } from "./Button";
import { addAlert } from "../../actions/ui";
import { TransferOwnershipSteps } from "../../utils/steps";
import StatusModal from "./StatusModal";
import ErrorModal from "./ErrorModal";

export default function AcceptOwnershipButton({
  currentProjectId,
}: {
  currentProjectId?: string;
}) {
  const dispatch = useDispatch();

  const [submitted, setSubmitted] = useState(false);
  const [show, showModal] = useState(false);

  const props = useSelector((state: RootState) => {
    const prevMetadata = state.grantsMetadata[currentProjectId || ""];

    return {
      prevMetadata,
      metadata: state.projectForm.metadata,
      credentials: state.projectForm.credentials,
      status: state.acceptProfileOwnership.status,
      error: state.acceptProfileOwnership.error,
      openErrorModal: state.newGrant.error !== undefined,
    };
  }, shallowEqual);

  const resetSubmit = () => {
    showModal(false);
  };

  const allo = useAllo();

  const publishProject = async () => {
    if (allo === null) {
      return;
    }

    setSubmitted(true);
    showModal(true);
    dispatch(acceptOwnership(allo, currentProjectId));
  };

  useEffect(() => {
    if (props.status === Status.Completed) {
      setTimeout(() => {
        resetSubmit();
        dispatch(
          addAlert(
            "success",
            "You are again the Owner of your Project!",
            undefined
          )
        );
      }, 1500);
    }

    if (props.status === Status.Error) {
      setTimeout(() => {
        resetSubmit();
        setSubmitted(false);
        dispatch(addAlert("error", "Transfer Ownerdhip failed!", undefined));
      }, 1500);
    }
  }, [props.status]);

  return (
    <div>
      <div className="flex justify-start">
        {!submitted && (
          <Button
            disabled={submitted}
            variant={ButtonVariants.primary}
            onClick={publishProject}
            dataTrackEvent="transfer-project-ownership-next"
          >
            Accept Ownership
          </Button>
        )}
      </div>
      <StatusModal
        open={show && !props.openErrorModal}
        onClose={() => showModal(false)}
        currentStatus={props.status}
        steps={TransferOwnershipSteps}
        error={props.error}
        title="Please hold on while we transfer project ownership."
      />
      <ErrorModal
        open={props.openErrorModal}
        onClose={resetSubmit}
        onRetry={publishProject}
      />
    </div>
  );
}
