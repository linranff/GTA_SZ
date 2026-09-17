#pragma once

#include "CoreMinimal.h"
#include "CityTypes.generated.h"

USTRUCT(BlueprintType)
struct SHENCHENGJI_API FShenchengjiGamePoint
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "深城纪")
	double X = 0;

	UPROPERTY(BlueprintReadOnly, Category = "深城纪")
	double Z = 0;

	UPROPERTY(BlueprintReadOnly, Category = "深城纪")
	double Yaw = 0;

	UPROPERTY(BlueprintReadOnly, Category = "深城纪")
	double Heading = 0;

	UPROPERTY(BlueprintReadOnly, Category = "深城纪")
	double BuildingX = 0;

	UPROPERTY(BlueprintReadOnly, Category = "深城纪")
	double BuildingZ = 0;

	UPROPERTY(BlueprintReadOnly, Category = "深城纪")
	FString Id;

	UPROPERTY(BlueprintReadOnly, Category = "深城纪")
	FString Name;
};

USTRUCT()
struct FShenchengjiSkeletonRoad
{
	GENERATED_BODY()

	FString Id;
	FString Name;
	FString Kind;
	double Width = 6;
	TArray<FVector2D> Points;
};

USTRUCT()
struct FShenchengjiSkeletonBuilding
{
	GENERATED_BODY()

	double X = 0;
	double Z = 0;
	double W = 8;
	double D = 8;
	double Height = 12;
};

USTRUCT()
struct FShenchengjiCitySkeleton
{
	GENERATED_BODY()

	bool bLoaded = false;
	FShenchengjiGamePoint Spawn;
	TMap<FString, FShenchengjiGamePoint> Places;
	TArray<FShenchengjiGamePoint> Landmarks;
	TArray<FShenchengjiSkeletonRoad> Roads;
	TArray<FShenchengjiSkeletonBuilding> Buildings;
};
