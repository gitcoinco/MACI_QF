import React, { useState, useRef, useEffect } from "react";
import { CartProject } from "../../api/types";
import DefaultLogoImage from "../../../assets/default_logo.png";
import { Link } from "react-router-dom";
import { EyeIcon } from "@heroicons/react/24/solid";
import { TrashIcon } from "@heroicons/react/24/outline";
import { renderToPlainText, VotingToken } from "common";
import { useCartStorage } from "../../../store";
import {
  Box,
  Flex,
  Image,
  Text,
  Input,
  InputGroup,
  InputRightElement,
  Alert,
  AlertIcon,
} from "@chakra-ui/react";
import { groupProjectsInCart } from "../../api/utils";

export function ProjectInCart(
  props: React.ComponentProps<"div"> & {
    project: CartProject;
    index: number;
    projects: CartProject[];
    roundRoutePath: string;
    last?: boolean;
    selectedPayoutToken: VotingToken;
    payoutTokenPrice: number;
    totalAmount: number;
    removeProjectFromCart: (
      project: CartProject,
      walletAddress: string
    ) => void;
    walletAddress: string;
    alreadyContributed: boolean;
  }
) {
  const {
    project,
    index,
    projects,
    roundRoutePath,
    totalAmount,
    removeProjectFromCart,
  } = props;

  const store = useCartStorage();

  const groupedProjects = groupProjectsInCart(projects);
  const roundProjects = groupedProjects[project.chainId][project.roundId];

  const _percentage = (Number(project.amount) / totalAmount) * 100;
  const [percentage, setPercentage] = useState<string>(
    (isNaN(_percentage) ? 0.0 : _percentage).toFixed(10)
  );
  const [showAlert, setShowAlert] = useState(false);

  const handlePercentageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPercentage = e.target.value;
    if (parseFloat(newPercentage) > 100 || parseFloat(newPercentage) < 0) {
      setShowAlert(true);
      return;
    }
    updateProjectAmount(index, parseFloat(newPercentage));
  };

  const updateProjectAmount = (currentIndex: number, newPercentage: number) => {
    const newAmount = (totalAmount * newPercentage) / 100;

    // find the total amount of all projects in the round except the current project
    const totalAmountOfOtherProjects = roundProjects
      .filter((_, i) => i !== currentIndex)
      .reduce(
        (acc, project) => acc + Number(parseFloat(project.amount).toFixed(10)),
        0
      );
    if (totalAmountOfOtherProjects + newAmount > totalAmount) {
      store.updateUserDonationAmount(
        project.chainId,
        project.roundId,
        project.grantApplicationId,
        project.amount,
        props.walletAddress
      );
      return;
    }

    store.updateUserDonationAmount(
      project.chainId,
      project.roundId,
      project.grantApplicationId,
      newAmount.toFixed(10),
      props.walletAddress
    );
    setPercentage(newPercentage.toFixed(10));
  };

  useEffect(() => {
    const newAmount = props.alreadyContributed
      ? ((totalAmount * parseFloat(percentage)) / 100).toFixed(10)
      : ((totalAmount * parseFloat(percentage)) / 100).toFixed(10);
    store.updateUserDonationAmount(
      project.chainId,
      project.roundId,
      project.grantApplicationId,
      newAmount,
      props.walletAddress
    );
  }, [totalAmount, props.alreadyContributed]);

  useEffect(() => {
    setPercentage(((Number(project.amount) / totalAmount) * 100).toFixed(10));
  }, [project.amount]);
  return (
    <Box
      data-testid="cart-project"
      mb={4}
      p={4}
      borderWidth={1}
      borderRadius="md"
    >
      {showAlert && (
        <Alert status="error" mb={4}>
          <AlertIcon />
          Percentage cannot exceed 100%
        </Alert>
      )}
      <Flex justify="space-between" align="center">
        <Flex>
          <Box
            position="relative"
            w="64px"
            h="64px"
            overflow="hidden"
            borderRadius="full"
          >
            <Image
              boxSize="64px"
              src={
                project.projectMetadata?.logoImg
                  ? `https://${process.env.REACT_APP_PINATA_GATEWAY}/ipfs/${project.projectMetadata?.logoImg}`
                  : DefaultLogoImage
              }
              alt={"Project Logo"}
              borderRadius="full"
            />
            <Link to={`${roundRoutePath}/${project.grantApplicationId}`}>
              <Flex
                position="absolute"
                top={0}
                right={0}
                bottom={0}
                left={0}
                justifyContent="center"
                alignItems="center"
                bg="gray.500"
                opacity={0}
                _hover={{ opacity: 0.7 }}
                transition="opacity 0.3s"
                borderRadius="full"
              >
                <EyeIcon
                  className="fill-gray-200 w-6 h-6 cursor-pointer"
                  data-testid={`${project.projectRegistryId}-project-link`}
                />
              </Flex>
            </Link>
          </Box>
          <Box pl={6}>
            <Link
              to={`${roundRoutePath}/${project.grantApplicationId}`}
              data-testid={"cart-project-link"}
            >
              <Text
                fontWeight="semibold"
                fontSize="lg"
                mb={2}
                isTruncated
                maxW="400px"
              >
                {project.projectMetadata?.title}
              </Text>
            </Link>
            <Text fontSize="sm" isTruncated maxW="400px">
              {renderToPlainText(
                project.projectMetadata?.description ?? ""
              ).substring(0, 130)}
            </Text>
          </Box>
        </Flex>
        <Flex align="center">
          <Box>
            <InputGroup size="sm">
              <Input
                aria-label={`Donation percentage for project ${project.projectMetadata?.title}`}
                value={Number(percentage).toFixed(0)}
                onChange={handlePercentageChange}
                className="rounded-xl"
                min={0}
                max={100}
                type="number"
                width="80px"
                textAlign="center"
              />
              <InputRightElement width="2.5rem" children="%" />
            </InputGroup>
          </Box>
          <Text ml={2}>{props.selectedPayoutToken?.name}</Text>
          {props.payoutTokenPrice && (
            <Box ml={2}>
              <Text fontSize="sm" color="gray.400">
                ${" "}
                {(parseFloat(project.amount) * props.payoutTokenPrice).toFixed(
                  2
                )}
              </Text>
            </Box>
          )}
          {!props.alreadyContributed && (
            <TrashIcon
              data-testid="remove-from-cart"
              onClick={() =>
                removeProjectFromCart(project, props.walletAddress)
              }
              className="w-5 h-5 ml-2 cursor-pointer"
            />
          )}
        </Flex>
      </Flex>
      {!props.last && <Box as="hr" borderColor="gray.100" mt={4} />}
    </Box>
  );
}
