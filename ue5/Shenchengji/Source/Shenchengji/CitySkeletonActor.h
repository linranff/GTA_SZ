#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "CityTypes.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "CitySkeletonActor.generated.h"

UCLASS()
class SHENCHENGJI_API AShenchengjiCitySkeletonActor : public AActor
{
	GENERATED_BODY()

public:
	AShenchengjiCitySkeletonActor();
	void BuildFromSkeleton(const FShenchengjiCitySkeleton& Skeleton);
	void TeleportPawnToPlace(APawn* Pawn, const FString& PlaceId) const;
	void HideProxyCity();

	UPROPERTY(VisibleAnywhere, Category = "深城纪")
	TObjectPtr<USceneComponent> Root;

	UPROPERTY(VisibleAnywhere, Category = "深城纪")
	TObjectPtr<UInstancedStaticMeshComponent> BuildingsMesh;

	UPROPERTY(VisibleAnywhere, Category = "深城纪")
	TObjectPtr<UInstancedStaticMeshComponent> RoadsMesh;

	UPROPERTY(VisibleAnywhere, Category = "深城纪")
	TObjectPtr<UStaticMeshComponent> GroundMesh;

protected:
	virtual void BeginPlay() override;

private:
	FShenchengjiCitySkeleton Cached;
	void AddMarker(const FShenchengjiGamePoint& Point, const FLinearColor& Color);
};
