import React from 'react';
import { Flex, Heading } from '@chakra-ui/react';
import { Link } from 'react-router-dom';

const NavigationBar = ({ title = 'dicompare' }) => {
  return (
    <Flex justify="space-between" align="center" padding="1rem 2rem" bg="teal.500" color="white" boxShadow="md">
      <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
        <Heading as="h1" size="xl">
          {title}
        </Heading>
      </Link>
    </Flex>
  );
};

export default NavigationBar;
