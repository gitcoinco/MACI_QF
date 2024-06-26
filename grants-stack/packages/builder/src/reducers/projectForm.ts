import {
  METADATA_SAVED,
  METADATA_IMAGE_SAVED,
  FORM_RESET,
  ProjectFormActions,
} from "../actions/projectForm";
import { FormInputs } from "../types";

export interface ProjectFormState {
  metadata: FormInputs;
}

export const initialState: ProjectFormState = {
  metadata: {},
};

export const projectFormReducer = (
  state: ProjectFormState = initialState,
  action: ProjectFormActions
) => {
  switch (action.type) {
    case METADATA_SAVED: {
      return {
        ...state,
        metadata: {
          ...state.metadata,
          ...action.metadata,
        },
      };
    }

    case METADATA_IMAGE_SAVED: {
      return {
        ...state,
        metadata: {
          ...state.metadata,
          [action.fieldName]: action.image,
        },
      };
    }

    case FORM_RESET: {
      return initialState;
    }
    default: {
      return state;
    }
  }
};
